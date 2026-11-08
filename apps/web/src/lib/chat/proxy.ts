import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createTextStreamResponse, type ModelMessage, streamText, toTextStream } from 'ai';
import {
  clampOutputTokens,
  IMAGE_BYTES_MAX,
  IMAGE_MIME_TYPES,
  MAX_BODY_BYTES,
  MAX_ENDPOINT_CHARS,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGE_PARTS_BYTES,
  MAX_MESSAGES,
  OUTPUT_DEFAULT,
  TEMPERATURE,
} from './llm';

export const CONNECT_TIMEOUT_MS = 8000;
export const IDLE_TIMEOUT_MS = 30 * 1000;

const encoder = new TextEncoder();

interface ChatBody {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
}

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') || hostname.includes(':')) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
}

export function parseEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ENDPOINT_CHARS) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
  if (hostname.endsWith('.home.arpa')) return null;
  if (isIpLiteral(hostname)) return null;
  return url.toString().replace(/\/+$/u, '');
}

interface TextPart {
  type: 'text';
  text: string;
}
interface ImagePart {
  type: 'image';
  image: string;
}
type ContentPart = TextPart | ImagePart;

const IMAGE_MIME = new Set<string>(IMAGE_MIME_TYPES);

function readTextPart(value: unknown, budget: { bytes: number }): TextPart | string {
  if (typeof value !== 'string') return 'text part must be a string';
  const bytes = encoder.encode(value).byteLength;
  if (bytes > MAX_MESSAGE_BYTES) return 'text part is too long';
  budget.bytes += bytes;
  return { type: 'text', text: value };
}

function readImagePart(value: unknown, budget: { bytes: number }): ImagePart | string {
  if (typeof value !== 'string') return 'image part must be a data URL';
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/iu.exec(value);
  if (!match) return 'image part must be a base64 data URL';
  const mime = (match[1] ?? '').toLowerCase();
  if (!IMAGE_MIME.has(mime)) return 'image type is not supported';
  const bytes = Math.ceil(((value.length - match[0].length) * 3) / 4);
  if (bytes > IMAGE_BYTES_MAX) return 'image is too large';
  budget.bytes += bytes;
  return { type: 'image', image: value };
}

type ReadContent = { ok: true; content: string | ContentPart[] } | { ok: false; error: string };

/** A message is either plain text or text/image parts, the shape the SDK sends. */
function readContent(value: unknown): ReadContent {
  if (typeof value === 'string') {
    if (encoder.encode(value).byteLength > MAX_MESSAGE_BYTES) {
      return { ok: false, error: 'message content is too long' };
    }
    return { ok: true, content: value };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: 'message content must be text or content parts' };
  }
  const budget = { bytes: 0 };
  const parts: ContentPart[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, error: 'each content part must be an object' };
    }
    const part = raw as Record<string, unknown>;
    const parsed =
      part.type === 'text'
        ? readTextPart(part.text, budget)
        : part.type === 'image'
          ? readImagePart(part.image, budget)
          : 'unsupported content part';
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    if (budget.bytes > MAX_MESSAGE_PARTS_BYTES) {
      return { ok: false, error: 'message content is too large' };
    }
    parts.push(parsed);
  }
  return { ok: true, content: parts };
}

function readMessages(value: unknown): ModelMessage[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'messages must be a non-empty array';
  if (value.length > MAX_MESSAGES) {
    return `messages must contain at most ${MAX_MESSAGES} entries`;
  }
  const messages: ModelMessage[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return 'each message must be an object';
    const record = entry as Record<string, unknown>;
    const role = record.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return 'unsupported message role';
    }
    const content = readContent(record.content);
    if (!content.ok) return content.error;
    messages.push({ role, content: content.content } as ModelMessage);
  }
  return messages;
}

function readBody(raw: unknown): ChatBody | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be a JSON object';
  const record = raw as Record<string, unknown>;
  const endpoint = parseEndpoint(record.endpoint);
  if (!endpoint) return 'endpoint must be a public https URL';
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) {
    return 'apiKey is required';
  }
  if (record.apiKey.length > 2048) return 'apiKey is too long';
  if (typeof record.model !== 'string' || record.model.length === 0) {
    return 'model is required';
  }
  let maxOutputTokens = OUTPUT_DEFAULT;
  if (record.maxOutputTokens !== undefined) {
    if (typeof record.maxOutputTokens !== 'number' || !Number.isFinite(record.maxOutputTokens)) {
      return 'maxOutputTokens must be a number';
    }
    maxOutputTokens = clampOutputTokens(record.maxOutputTokens);
  }
  const messages = readMessages(record.messages);
  if (typeof messages === 'string') return messages;
  return { endpoint, apiKey: record.apiKey, model: record.model, messages, maxOutputTokens };
}

/**
 * Streams one assistant turn from a user-supplied OpenAI-compatible endpoint.
 * The endpoint receives the recent conversation plus the caller's system text;
 * the reply is re-emitted as a plain chunked text stream.
 */
export async function handleChat(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return fail(403, 'cross-origin request rejected');
  }

  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(413, 'request body is too large');
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, 'request body could not be read');
  }
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) {
    return fail(413, 'request body is too large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(400, 'request body must be JSON');
  }

  const body = readBody(parsed);
  if (typeof body === 'string') return fail(400, body);

  const system = body.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const conversation = body.messages.filter((message) => message.role !== 'system');
  if (conversation.length === 0) return fail(400, 'messages need a user or assistant entry');

  const provider = createOpenAICompatible({
    name: 'partner-proxy',
    baseURL: body.endpoint,
    apiKey: body.apiKey,
  });

  const result = streamText({
    model: provider(body.model),
    instructions: system || undefined,
    messages: conversation,
    temperature: TEMPERATURE,
    maxOutputTokens: body.maxOutputTokens,
    abortSignal: request.signal,
    timeout: { firstChunkMs: CONNECT_TIMEOUT_MS, chunkMs: IDLE_TIMEOUT_MS },
    onError: (error) => {
      console.warn('chat upstream error', error instanceof Error ? error.name : 'unknown');
    },
  });

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream }),
    headers: { 'cache-control': 'no-store' },
  });
}
