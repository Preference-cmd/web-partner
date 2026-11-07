import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleChat, MAX_BODY_BYTES } from './proxy';

const encoder = new TextEncoder();

function sseChunks(): ReadableStream<Uint8Array> {
  const chunks = [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,"model":"demo-model","choices":[{"index":0,"delta":{"role":"assistant","content":"EMOTION: happy\\n"},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,"model":"demo-model","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,"model":"demo-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n',
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

type FetchCall = [string, RequestInit];

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://127.0.0.1:4321/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  endpoint: 'https://api.example.com/v1',
  apiKey: 'sk-proxy-test',
  model: 'demo-model',
  messages: [
    { role: 'system', content: '你是一只鲸鱼。' },
    { role: 'user', content: '你好' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('chat proxy', () => {
  it('streams the model text and forwards the turn', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleChat(makeRequest(baseBody, { origin: 'http://127.0.0.1:4321' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('EMOTION: happy\n你好');

    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-proxy-test');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(120);
    expect(body.temperature).toBe(0.7);
    expect(body.messages).toEqual([
      { role: 'system', content: '你是一只鲸鱼。' },
      { role: 'user', content: '你好' },
    ]);
  });

  it('rejects a cross-origin request before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleChat(makeRequest(baseBody, { origin: 'https://evil.example' }));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the key out of the response and the logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(sseChunks(), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    );
    const response = await handleChat(makeRequest(baseBody));
    const text = await response.text();
    expect(text).not.toContain('sk-proxy-test');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sk-proxy-test');
  });

  it.each([
    ['http', 'http://api.example.com/v1'],
    ['ipv4', 'https://127.0.0.1/v1'],
    ['ipv6', 'https://[::1]/v1'],
    ['localhost', 'https://localhost/v1'],
    ['dot-local', 'https://api.local/v1'],
    ['dot-internal', 'https://api.internal/v1'],
    ['home-arpa', 'https://router.home.arpa/v1'],
    ['query', 'https://api.example.com/v1?x=1'],
    ['credentials', 'https://user:pass@api.example.com/v1'],
    ['too-long', `https://${'a'.repeat(3000)}.example.com/v1`],
  ])('rejects a %s endpoint without calling upstream', async (_name, endpoint) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleChat(makeRequest({ ...baseBody, endpoint }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body over the size cap', async () => {
    const messages = Array.from({ length: 20 }, () => ({
      role: 'user',
      content: '啊'.repeat(600),
    }));
    const response = await handleChat(makeRequest({ ...baseBody, messages }));
    expect(response.status).toBe(413);
    expect(MAX_BODY_BYTES).toBe(32 * 1024);
  });

  it('rejects too many messages, oversized text and missing fields', async () => {
    const tooMany = Array.from({ length: 22 }, () => ({ role: 'user', content: '在' }));
    expect((await handleChat(makeRequest({ ...baseBody, messages: tooMany }))).status).toBe(400);
    expect(
      (
        await handleChat(
          makeRequest({
            ...baseBody,
            messages: [{ role: 'user', content: 'x'.repeat(2049) }],
          }),
        )
      ).status,
    ).toBe(400);
    expect((await handleChat(makeRequest({ ...baseBody, apiKey: '' }))).status).toBe(400);
    expect((await handleChat(makeRequest({ ...baseBody, model: '' }))).status).toBe(400);
    expect((await handleChat(makeRequest({ ...baseBody, messages: [] }))).status).toBe(400);
  });

  it('rejects a non-json body', async () => {
    const response = await handleChat(
      new Request('http://127.0.0.1:4321/api/chat', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('hoists a system message out of the conversation', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleChat(
      makeRequest({
        ...baseBody,
        messages: [
          { role: 'user', content: '先说话' },
          { role: 'system', content: '后置的系统提示' },
          { role: 'assistant', content: '嗯' },
        ],
      }),
    );
    await response.text();
    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    if (!call) throw new Error('fetch was not called');
    const body = JSON.parse(String(call[1].body)) as { messages: unknown[] };
    expect(body.messages[0]).toEqual({ role: 'system', content: '后置的系统提示' });
    expect(body.messages).toHaveLength(3);
  });
});
