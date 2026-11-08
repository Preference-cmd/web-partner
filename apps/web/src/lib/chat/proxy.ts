import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createTextStreamResponse, type ModelMessage, streamText, toTextStream } from 'ai';
import {
  clampOutputTokens,
  MAX_BODY_BYTES,
  MAX_ENDPOINT_CHARS,
  MAX_MESSAGE_BYTES,
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
    if (typeof record.content !== 'string') return 'message content must be a string';
    if (encoder.encode(record.content).byteLength > MAX_MESSAGE_BYTES) {
      return 'message content is too long';
    }
    messages.push({ role, content: record.content });
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
