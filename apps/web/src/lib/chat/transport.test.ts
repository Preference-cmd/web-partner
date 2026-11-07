import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from './transport';
import { streamChat } from './transport';

const encoder = new TextEncoder();

function replyBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

const request: ChatRequest = {
  endpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test-abc',
  model: 'demo-model',
  messages: [{ role: 'user', content: 'hi' }],
  direct: false,
};

type FetchCall = [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat transport', () => {
  it('posts the turn to the same-origin proxy', async () => {
    const fetchMock = vi.fn(async () => new Response(replyBody(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    await streamChat(request, new AbortController().signal, (text) => deltas.push(text));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    expect(call[0]).toBe('/api/chat');
    expect(JSON.parse(String(call[1].body))).toEqual({
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test-abc',
      model: 'demo-model',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(deltas.join('')).toBe('你好');
  });

  it('calls the endpoint directly when direct mode is on', async () => {
    const fetchMock = vi.fn(async () => new Response(replyBody(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await streamChat({ ...request, direct: true }, new AbortController().signal, () => undefined);
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test-abc');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(120);
  });

  it('throws on a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 502 })),
    );
    await expect(
      streamChat(request, new AbortController().signal, () => undefined),
    ).rejects.toThrow('502');
  });
});
