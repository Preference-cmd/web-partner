import { describe, expect, it } from 'vitest';
import { CHAT_KEY, type ChatSnapshot, createChatStorage } from './chat-storage';
import { createChatController, SYSTEM_PROMPT } from './controller';
import { DEMO_POOL, GREETING } from './demo';
import { DEFAULT_SETTINGS, type Settings, type StringStorage } from './settings';
import type { ChatRequest, StreamTransport } from './transport';
import type { Message } from './types';

function memoryStorage(): StringStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const liveSettings: Partial<Settings> = {
  mode: 'live',
  endpoint: 'https://api.example.com/v1',
  model: 'demo-model',
};

interface HarnessOptions {
  settings?: Partial<Settings>;
  apiKey?: string;
  transport?: StreamTransport;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  stored?: ChatSnapshot;
  random?: () => number;
}

function makeHarness(options: HarnessOptions = {}) {
  const raw = memoryStorage();
  if (options.stored) raw.setItem(CHAT_KEY, JSON.stringify(options.stored));
  const storage = createChatStorage(raw);
  const writes: ChatSnapshot[] = [];
  const requests: ChatRequest[] = [];
  const logs: string[] = [];
  let ids = 0;
  const transport: StreamTransport = (request, signal, onDelta) => {
    requests.push(request);
    if (options.transport) return options.transport(request, signal, onDelta);
    onDelta('EMOTION: happy\n你好呀。');
    return Promise.resolve();
  };
  const controller = createChatController({
    storage: {
      read: storage.read,
      clear: storage.clear,
      write: (snapshot) => {
        writes.push(snapshot);
        storage.write(snapshot);
      },
    },
    getConfig: () => ({
      settings: { ...DEFAULT_SETTINGS, ...options.settings },
      apiKey: options.apiKey ?? '',
    }),
    transport,
    sleep: options.sleep ?? (() => Promise.resolve()),
    now: () => 1000,
    newId: () => {
      ids += 1;
      return 'm' + ids;
    },
    random: options.random ?? (() => 0),
    onLog: (line) => logs.push(line),
  });
  return {
    controller,
    raw,
    writes,
    requests,
    logs,
    last: () => controller.store.getState().messages.at(-1),
  };
}

function message(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, role, content, at: 1 };
}

describe('chat controller', () => {
  it('runs a demo turn without touching the transport', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('今天好累，想睡觉。');
    expect(run.last()?.role).toBe('assistant');
    expect(run.last()?.status).toBe('streaming');
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.status).toBe('done');
    expect(reply?.source).toBe('demo');
    expect(reply?.emotion).toBe('sleepy');
    expect(DEMO_POOL.sleepy).toContain(reply?.content);
    expect(run.requests).toHaveLength(0);
    expect(run.controller.store.getState().pendingId).toBeNull();
  });

  it('does not repeat the previous template', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('在吗');
    await run.controller.settled();
    const first = run.last()?.content;
    run.controller.send('在吗');
    await run.controller.settled();
    expect(run.last()?.content).not.toBe(first);
  });

  it('serves quick replies locally even in live mode', async () => {
    const run = makeHarness({ settings: liveSettings, apiKey: 'sk-test' });
    run.controller.hydrate();
    run.controller.quickReply('摸摸头');
    await run.controller.settled();
    expect(run.requests).toHaveLength(0);
    expect(run.last()?.source).toBe('demo');
  });

  it('sends the model request through the live path', async () => {
    const run = makeHarness({ settings: liveSettings, apiKey: 'sk-test' });
    run.controller.hydrate();
    run.controller.send('你好');
    await run.controller.settled();
    expect(run.requests).toHaveLength(1);
    const request = run.requests[0];
    expect(request?.endpoint).toBe('https://api.example.com/v1');
    expect(request?.apiKey).toBe('sk-test');
    expect(request?.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(request?.messages.at(-1)).toEqual({ role: 'user', content: '你好' });
    const reply = run.last();
    expect(reply?.source).toBe('model');
    expect(reply?.content).toBe('你好呀。');
    expect(reply?.emotion).toBe('happy');
  });

  it('drops the oldest turns once the context window is full', async () => {
    const stored: Message[] = Array.from({ length: 21 }, (_, index) =>
      message('h' + index, index % 2 === 0 ? 'user' : 'assistant', '历史' + index),
    );
    const run = makeHarness({
      settings: liveSettings,
      apiKey: 'sk-test',
      stored: { messages: stored, pendingId: null },
    });
    run.controller.hydrate();
    run.controller.send('最新');
    await run.controller.settled();
    const request = run.requests[0];
    const body = request?.messages.slice(1) ?? [];
    expect(body).toHaveLength(20);
    expect(body[0]?.content).toBe('历史2');
    expect(body.at(-1)).toEqual({ role: 'user', content: '最新' });
  });

  it('persists at the start and the end of a turn, not per token', async () => {
    const run = makeHarness({ settings: liveSettings, apiKey: 'sk-test' });
    run.controller.hydrate();
    expect(run.writes).toHaveLength(1);
    run.controller.send('你好');
    await run.controller.settled();
    expect(run.writes).toHaveLength(3);
    expect(run.writes[1]?.pendingId).not.toBeNull();
    expect(run.writes[2]?.pendingId).toBeNull();
  });

  it('falls back to a template when the endpoint fails', async () => {
    const run = makeHarness({
      settings: liveSettings,
      apiKey: 'sk-test',
      transport: () => Promise.reject(new Error('upstream down')),
    });
    run.controller.hydrate();
    run.controller.send('晚安');
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.source).toBe('fallback');
    expect(reply?.status).toBe('done');
    expect(reply?.content.length).toBeGreaterThan(0);
    expect(run.logs.length).toBeGreaterThan(0);
  });

  it('falls back when the model returns an empty stream', async () => {
    const run = makeHarness({
      settings: liveSettings,
      apiKey: 'sk-test',
      transport: () => Promise.resolve(),
    });
    run.controller.hydrate();
    run.controller.send('晚安');
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.source).toBe('fallback');
    expect(reply?.content.length).toBeGreaterThan(0);
    expect(run.logs.some((line) => line.includes('no text'))).toBe(true);
  });

  it('keeps the received text when the stream breaks', async () => {
    const run = makeHarness({
      settings: liveSettings,
      apiKey: 'sk-test',
      transport: async (_request, _signal, onDelta) => {
        onDelta('EMOTION: shy\n嗯');
        throw new Error('stream reset');
      },
    });
    run.controller.hydrate();
    run.controller.send('你好');
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.content).toBe('嗯');
    expect(reply?.source).toBe('fallback');
    expect(reply?.emotion).toBe('shy');
  });

  it('stops a turn and keeps the generated text', async () => {
    let calls = 0;
    const sleep = (_ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        calls += 1;
        if (calls <= 4) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    const run = makeHarness({ sleep });
    run.controller.hydrate();
    run.controller.send('你好');
    await flush();
    expect(run.controller.store.getState().status).toBe('streaming');
    run.controller.stop();
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.status).toBe('aborted');
    expect(reply?.content.length).toBeGreaterThan(0);
    expect(run.controller.store.getState().status).toBe('idle');
  });

  it('keeps an empty reply marked aborted', async () => {
    const sleep = (_ms: number, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    const run = makeHarness({ sleep });
    run.controller.hydrate();
    run.controller.send('你好');
    await flush();
    run.controller.stop();
    await run.controller.settled();
    const reply = run.last();
    expect(reply?.role).toBe('assistant');
    expect(reply?.status).toBe('aborted');
    expect(reply?.content).toBe('');
  });

  it('aborts the previous turn and drops late tokens', async () => {
    const releases: Array<(text: string) => void> = [];
    const transport: StreamTransport = (_request, signal, onDelta) =>
      new Promise<void>((resolve, reject) => {
        onDelta('EMOTION: happy\n第一');
        releases.push((text) => {
          onDelta(text);
          resolve();
        });
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    const run = makeHarness({ settings: liveSettings, apiKey: 'sk-test', transport });
    run.controller.hydrate();
    run.controller.send('一');
    await flush();
    run.controller.send('二');
    await flush();
    const aborted = run.controller.store
      .getState()
      .messages.find((item) => item.status === 'aborted');
    expect(aborted?.content).toBe('第一');
    releases[0]?.('迟到');
    releases[1]?.('第二');
    await run.controller.settled();
    const messages = run.controller.store.getState().messages;
    expect(messages.find((item) => item.status === 'aborted')?.content).toBe('第一');
    expect(messages.at(-1)?.content).toBe('第一第二');
    expect(messages.at(-1)?.source).toBe('model');
  });

  it('marks an interrupted turn as aborted after a reload', () => {
    const stored: Message[] = [
      message('a', 'user', '在吗'),
      { ...message('b', 'assistant', '半句'), status: 'streaming', source: 'model' },
    ];
    const run = makeHarness({ stored: { messages: stored, pendingId: 'b' } });
    run.controller.hydrate();
    const messages = run.controller.store.getState().messages;
    expect(messages.at(-1)?.status).toBe('aborted');
    expect(messages.at(-1)?.content).toBe('半句');
    expect(run.writes).toHaveLength(1);
    expect(run.writes[0]?.pendingId).toBeNull();
  });

  it('seeds a greeting when there is no history', () => {
    const run = makeHarness();
    run.controller.hydrate();
    const messages = run.controller.store.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe(GREETING);
    expect(messages[0]?.source).toBe('demo');
    expect(run.writes).toHaveLength(1);
  });

  it('clears the conversation and its storage', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('在吗');
    await run.controller.settled();
    run.controller.clear();
    expect(run.controller.store.getState().messages).toEqual([]);
    expect(run.raw.getItem(CHAT_KEY)).toBeNull();
  });

  it('restarts with a single greeting and drops the old history', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('在吗');
    await run.controller.settled();
    run.controller.restart();
    const state = run.controller.store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe(GREETING);
    expect(state.status).toBe('idle');
    expect(state.pendingId).toBeNull();
    expect(state.emotion).toBe('idle');
    expect(run.raw.getItem(CHAT_KEY)).toContain('"pendingId":null');
  });

  it('stops a running reply when it restarts', async () => {
    let aborted = false;
    const run = makeHarness({
      sleep: (_ms, signal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
          setTimeout(resolve, 50);
        }),
    });
    run.controller.hydrate();
    run.controller.send('在吗');
    run.controller.restart();
    await flush();
    expect(aborted).toBe(true);
    expect(run.controller.store.getState().messages).toHaveLength(1);
  });
});
