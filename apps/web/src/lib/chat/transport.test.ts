import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from './transport';
import { streamChat } from './transport';

const encoder = new TextEncoder();

function textBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function sseBody(): ReadableStream<Uint8Array> {
  return textBody(['data: {"choices":[{"delta":{"content":"你好"}}]}\n\n', 'data: [DONE]\n\n']);
}

const request: ChatRequest = {
  endpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test-abc',
  model: 'demo-model',
  protocol: 'openai',
  messages: [{ role: 'user', content: 'hi' }],
  maxOutputTokens: 2048,
  reasoningEffort: 'off',
  direct: false,
};

type FetchCall = [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat transport', () => {
  it('posts the turn to the same-origin proxy and reads a text stream', async () => {
    const fetchMock = vi.fn(
      async () => new Response(textBody(['EMOTION: happy\n你', '好']), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    await streamChat(request, new AbortController().signal, (text) => deltas.push(text));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    expect(call[0]).toBe('/api/chat');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(JSON.parse(String(call[1].body))).toEqual({
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test-abc',
      model: 'demo-model',
      protocol: 'openai',
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 2048,
    });
    expect(deltas.join('')).toBe('EMOTION: happy\n你好');
  });

  it('calls the endpoint directly and parses its SSE when direct mode is on', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    await streamChat({ ...request, direct: true }, new AbortController().signal, (text) =>
      deltas.push(text),
    );
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test-abc');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(2048);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(deltas.join('')).toBe('你好');
  });

  it('adds reasoning_effort in direct mode only when the effort is on', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await streamChat(
      { ...request, direct: true, reasoningEffort: 'high' },
      new AbortController().signal,
      () => undefined,
    );
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_tokens).toBe(2048);
  });

  it('forwards the effort to the proxy only when it is on', async () => {
    const fetchMock = vi.fn(async () => new Response(textBody(['你好']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await streamChat(
      { ...request, reasoningEffort: 'medium' },
      new AbortController().signal,
      () => undefined,
    );
    await streamChat(request, new AbortController().signal, () => undefined);
    const bodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse(String((call as unknown as FetchCall)[1].body)) as Record<string, unknown>,
    );
    expect(bodies[0]?.reasoningEffort).toBe('medium');
    expect(bodies[1]).not.toHaveProperty('reasoningEffort');
  });

  it('throws with the proxy status and reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502 }),
      ),
    );
    await expect(
      streamChat(request, new AbortController().signal, () => undefined),
    ).rejects.toThrow('502: {"error":"upstream failed"}');
  });
});
