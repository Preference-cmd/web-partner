export interface SseOptions {
  onText: (text: string) => void;
}

/**
 * Parses one OpenAI-style SSE data payload. Returns the delta text, an empty
 * string when the payload carries no text, or null for the DONE marker.
 */
export function extractDelta(data: string): string | null {
  const payload = data.trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return '';
    const choices = (parsed as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first: unknown = choices[0];
    if (typeof first !== 'object' || first === null) return '';
    const delta = (first as { delta?: unknown }).delta;
    if (typeof delta === 'object' && delta !== null) {
      const content = (delta as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }
    const message = (first as { message?: unknown }).message;
    if (typeof message === 'object' && message !== null) {
      const content = (message as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }
    return '';
  } catch {
    return '';
  }
}

function eachEvent(block: string, onText: (text: string) => void): void {
  for (const line of block.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue;
    const text = extractDelta(line.slice(5));
    if (text) onText(text);
  }
}

/** Reads a plain chunked text body, used by the same-origin proxy. */
export async function readText(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onText(text);
    }
    const tail = decoder.decode();
    if (tail) onText(tail);
  } finally {
    reader.releaseLock();
  }
}

/** Reads an SSE body without buffering the whole reply. */
export async function readSse(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/u);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) eachEvent(block, onText);
    }
    buffer += decoder.decode();
    if (buffer.trim()) eachEvent(buffer, onText);
  } finally {
    reader.releaseLock();
  }
}
