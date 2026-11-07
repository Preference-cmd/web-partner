import { readSse } from './sse';
import type { ModelMessage } from './types';

export interface ChatRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  direct: boolean;
}

export type StreamTransport = (
  request: ChatRequest,
  signal: AbortSignal,
  onDelta: (text: string) => void,
) => Promise<void>;

export const TEMPERATURE = 0.7;
export const MAX_TOKENS = 120;

function trimSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

/**
 * Sends the turn through the same-origin proxy, or straight at the endpoint
 * when "direct" is on. Direct mode is for a local model and depends on the
 * endpoint's own CORS policy.
 */
export const streamChat: StreamTransport = async (request, signal, onDelta) => {
  const payload = request.direct
    ? {
        model: request.model,
        messages: request.messages,
        stream: true,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      }
    : {
        endpoint: request.endpoint,
        apiKey: request.apiKey,
        model: request.model,
        messages: request.messages,
      };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (request.direct) headers.authorization = `Bearer ${request.apiKey}`;
  const response = await fetch(
    request.direct ? `${trimSlash(request.endpoint)}/chat/completions` : '/api/chat',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    },
  );
  if (!response.ok) throw new Error(`chat request failed with ${response.status}`);
  if (!response.body) throw new Error('chat response carried no body');
  await readSse(response.body, onDelta);
};
