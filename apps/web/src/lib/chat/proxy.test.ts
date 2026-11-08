import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES, OUTPUT_DEFAULT } from './llm';
import { handleChat } from './proxy';

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
    expect(body.max_tokens).toBe(OUTPUT_DEFAULT);
    expect(body.temperature).toBe(0.7);
    expect(body.messages).toEqual([
      { role: 'system', content: '你是一只鲸鱼。' },
      { role: 'user', content: '你好' },
    ]);
  });

  it('forwards the requested output budget and clamps it', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await (await handleChat(makeRequest({ ...baseBody, maxOutputTokens: 2048 }))).text();
    await (await handleChat(makeRequest({ ...baseBody, maxOutputTokens: 99999 }))).text();

    const bodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse(String((call as unknown as FetchCall)[1].body)) as { max_tokens?: number },
    );
    expect(bodies[0]?.max_tokens).toBe(2048);
    expect(bodies[1]?.max_tokens).toBe(4096);
    expect((await handleChat(makeRequest({ ...baseBody, maxOutputTokens: 'big' }))).status).toBe(
      400,
    );
  });

  it('forwards a reasoning effort and rejects an unknown one', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await (await handleChat(makeRequest({ ...baseBody, reasoningEffort: 'high' }))).text();
    await (await handleChat(makeRequest({ ...baseBody, reasoningEffort: 'off' }))).text();

    const bodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse(String((call as unknown as FetchCall)[1].body)) as Record<string, unknown>,
    );
    expect(bodies[0]?.reasoning_effort).toBe('high');
    expect(bodies[1]).not.toHaveProperty('reasoning_effort');
    expect((await handleChat(makeRequest({ ...baseBody, reasoningEffort: 'turbo' }))).status).toBe(
      400,
    );
    expect((await handleChat(makeRequest({ ...baseBody, reasoningEffort: 3 }))).status).toBe(400);
  });

  it('forwards only the protocols it speaks', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await (await handleChat(makeRequest({ ...baseBody, protocol: 'openai' }))).text();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await handleChat(makeRequest({ ...baseBody, protocol: 'anthropic' }))).status).toBe(
      400,
    );
    expect((await handleChat(makeRequest({ ...baseBody, protocol: 3 }))).status).toBe(400);
    expect(
      (await (await handleChat(makeRequest({ ...baseBody, protocol: 'anthropic' }))).text()).length,
    ).toBeGreaterThan(0);
  });

  it('answers a probe with the upstream status, not a stream', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"nope"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const rejected = await handleChat(makeRequest({ ...baseBody, probe: true }));
    expect(rejected.status).toBe(200);
    expect(rejected.headers.get('content-type')).toContain('application/json');
    expect(await rejected.json()).toEqual({
      outcome: 'unauthorized',
      reason: 'key 或权限被拒绝（HTTP 401）',
    });

    const call = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8);
    expect(body.model).toBe('demo-model');
  });

  it('reports an upstream that will not answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('connection refused'))),
    );
    expect(await (await handleChat(makeRequest({ ...baseBody, probe: true }))).json()).toEqual({
      outcome: 'unreachable',
      reason: '连不上端点：检查 base URL、网络与端点可用性',
    });
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
    const messages = Array.from({ length: 200 }, () => ({
      role: 'user',
      content: '啊'.repeat(4000),
    }));
    const response = await handleChat(makeRequest({ ...baseBody, messages }));
    expect(response.status).toBe(413);
    expect(MAX_BODY_BYTES).toBe(2 * 1024 * 1024);
  });

  it('accepts a message made of text and image parts', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const image = 'data:image/png;base64,' + 'A'.repeat(4000);
    const response = await handleChat(
      makeRequest({
        ...baseBody,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '看看' },
              { type: 'image', image },
            ],
          },
        ],
      }),
    );
    expect(response.status).toBe(200);
    // The upstream call is lazy; consuming the stream is what starts it.
    expect(await response.text()).toBe('EMOTION: happy\n你好');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown content part or an image without a data URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const parts = await handleChat(
      makeRequest({ ...baseBody, messages: [{ role: 'user', content: [{ type: 'file' }] }] }),
    );
    const bare = await handleChat(
      makeRequest({
        ...baseBody,
        messages: [{ role: 'user', content: [{ type: 'image', image: 'https://x/y.png' }] }],
      }),
    );
    expect(parts.status).toBe(400);
    expect(bare.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a full window of 201 messages', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(sseChunks(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const messages = [
      { role: 'system', content: '系统' },
      ...Array.from({ length: 200 }, () => ({ role: 'user', content: '在' })),
    ];
    const response = await handleChat(makeRequest({ ...baseBody, messages }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('EMOTION: happy\n你好');
  });

  it('rejects too many messages, oversized text and missing fields', async () => {
    const tooMany = Array.from({ length: 202 }, () => ({ role: 'user', content: '在' }));
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
