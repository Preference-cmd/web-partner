import { TEMPERATURE } from './llm';
import { readSse, readText } from './sse';
import type { ModelMessage } from './types';

export interface ChatRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  direct: boolean;
}

export type StreamTransport = (
  request: ChatRequest,
  signal: AbortSignal,
  onDelta: (text: string) => void,
) => Promise<void>;

function trimSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

/**
 * Sends the turn through the same-origin proxy, or straight at the endpoint
 * when "direct" is on. Direct mode is for a local model and depends on the
 * endpoint's own CORS policy.
 */
export const streamChat: StreamTransport = async (request, signal, onDelta) => {
  if (request.direct) {
    const response = await fetch(`${trimSlash(request.endpoint)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        temperature: TEMPERATURE,
        max_tokens: request.maxOutputTokens,
      }),
      signal,
    });
    if (!response.ok) throw new Error(`chat request failed with ${response.status}`);
    if (!response.body) throw new Error('chat response carried no body');
    await readSse(response.body, onDelta);
    return;
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: request.endpoint,
      apiKey: request.apiKey,
      model: request.model,
      messages: request.messages,
      maxOutputTokens: request.maxOutputTokens,
    }),
    signal,
  });
  if (!response.ok) {
    const reason = await response.text().catch(() => '');
    throw new Error(
      `chat request failed with ${response.status}${reason ? `: ${reason.slice(0, 200)}` : ''}`,
    );
  }
  if (!response.body) throw new Error('chat response carried no body');
  await readText(response.body, onDelta);
};
