import { describe, expect, it } from 'vitest';
import { extractDelta, readSse } from './sse';

const encoder = new TextEncoder();

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('sse reader', () => {
  it('extracts delta text', () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"你"}}]}')).toBe('你');
  });

  it('treats the done marker as no text', () => {
    expect(extractDelta('[DONE]')).toBeNull();
  });

  it('ignores a malformed payload', () => {
    expect(extractDelta('{not json')).toBe('');
  });

  it('joins chunks split in the middle of an event', async () => {
    const body = streamOf([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":',
      '[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
    ]);
    const chunks: string[] = [];
    await readSse(body, (text) => chunks.push(text));
    expect(chunks.join('')).toBe('你好');
  });
});
