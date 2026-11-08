import { describe, expect, it } from 'vitest';
import { type ChatLog, createChatController, SYSTEM_PROMPT } from './controller';
import { DEMO_POOL, GREETING } from './demo';
import { estimateTokens, MESSAGE_OVERHEAD_TOKENS } from './llm';
import {
  createSessionStorage,
  DEFAULT_TITLE,
  LEGACY_CHAT_KEY,
  SESSION_LIMIT,
  type SessionMessages,
} from './session-storage';
import { DEFAULT_SETTINGS, type Settings, type StringStorage } from './settings';
import type { ChatRequest, StreamTransport } from './transport';
import type { Message } from './types';

function memoryStorage(): StringStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
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
  stored?: SessionMessages;
  random?: () => number;
  /** Tests that care about ordering advance this instead of the wall clock. */
  clock?: { value: number };
}

function makeHarness(options: HarnessOptions = {}) {
  const raw = memoryStorage();
  const storage = createSessionStorage(raw);
  if (options.stored) {
    storage.writeIndex({
      activeId: 's-test',
      sessions: [{ id: 's-test', title: DEFAULT_TITLE, createdAt: 1000, updatedAt: 1000 }],
    });
    storage.writeMessages('s-test', options.stored);
  }
  const writes: SessionMessages[] = [];
  const requests: ChatRequest[] = [];
  const entries: ChatLog[] = [];
  let ids = 0;
  const transport: StreamTransport = (request, signal, onDelta) => {
    requests.push(request);
    if (options.transport) return options.transport(request, signal, onDelta);
    onDelta('EMOTION: happy\n你好呀。');
    return Promise.resolve();
  };
  const controller = createChatController({
    storage: {
      ...storage,
      writeMessages: (id, snapshot) => {
        writes.push(snapshot);
        storage.writeMessages(id, snapshot);
      },
    },
    getConfig: () => ({
      settings: { ...DEFAULT_SETTINGS, ...options.settings },
      apiKey: options.apiKey ?? '',
    }),
    transport,
    sleep: options.sleep ?? (() => Promise.resolve()),
    now: () => options.clock?.value ?? 1000,
    newId: () => {
      ids += 1;
      return 'm' + ids;
    },
    random: options.random ?? (() => 0),
    onLog: (entry) => entries.push(entry),
  });
  return {
    controller,
    raw,
    storage,
    writes,
    requests,
    entries,
    logs: () => entries.map((entry) => entry.text),
    last: () => controller.store.getState().messages.at(-1),
    sessions: () => controller.store.getState().sessions,
    activeId: () => controller.store.getState().activeId ?? '',
    stored: (id: string) => storage.readMessages(id),
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
    expect(run.entries.at(-1)?.source).toBe('model');
  });

  it('drops the oldest turns once the token window is full', async () => {
    const stored: Message[] = Array.from({ length: 21 }, (_, index) =>
      message('h' + index, index % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(400)),
    );
    const run = makeHarness({
      settings: { ...liveSettings, contextTokens: 1000 },
      apiKey: 'sk-test',
      stored: { messages: stored, pendingId: null },
    });
    run.controller.hydrate();
    run.controller.send('最新');
    await run.controller.settled();
    const request = run.requests[0];
    const body = request?.messages.slice(1) ?? [];
    const total = body.reduce(
      (sum, item) =>
        sum +
        estimateTokens(typeof item.content === 'string' ? item.content : '') +
        MESSAGE_OVERHEAD_TOKENS,
      0,
    );
    expect(body.length).toBeGreaterThan(1);
    expect(body.length).toBeLessThan(21);
    expect(total).toBeLessThanOrEqual(1000);
    expect(body.at(-1)).toEqual({ role: 'user', content: '最新' });
  });

  it('sends the configured token window and output budget', async () => {
    const stored: Message[] = Array.from({ length: 40 }, (_, index) =>
      message('w' + index, index % 2 === 0 ? 'user' : 'assistant', '旧'.repeat(60) + index),
    );
    const run = makeHarness({
      settings: { ...liveSettings, maxOutputTokens: 2048, contextTokens: 120 },
      apiKey: 'sk-test',
      stored: { messages: stored, pendingId: null },
    });
    run.controller.hydrate();
    run.controller.send('新的');
    await run.controller.settled();
    const request = run.requests[0];
    const body = request?.messages.slice(1) ?? [];
    const total = body.reduce(
      (sum, item) =>
        sum +
        estimateTokens(typeof item.content === 'string' ? item.content : '') +
        MESSAGE_OVERHEAD_TOKENS,
      0,
    );
    expect(request?.maxOutputTokens).toBe(2048);
    expect(total).toBeLessThanOrEqual(120);
    expect(body.length).toBeGreaterThan(1);
    expect(body.length).toBeLessThan(40);
    expect(body.at(-1)).toEqual({ role: 'user', content: '新的' });
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
    expect(run.entries.some((entry) => entry.source === 'fallback')).toBe(true);
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
    expect(run.entries.some((entry) => entry.text.includes('模板'))).toBe(true);
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
    expect(run.sessions()).toHaveLength(1);
    expect(run.sessions()[0]?.title).toBe(DEFAULT_TITLE);
  });

  it('clears the active conversation but keeps its session', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('在吗');
    await run.controller.settled();
    run.controller.clear();
    expect(run.controller.store.getState().messages).toEqual([]);
    expect(run.stored(run.activeId())?.messages).toEqual([]);
    expect(run.sessions()).toHaveLength(1);
  });

  it('starts a new conversation without dropping the old one', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('在吗');
    await run.controller.settled();
    const first = run.activeId();
    run.controller.newSession();
    const state = run.controller.store.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe(GREETING);
    expect(state.activeId).not.toBe(first);
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions.find((session) => session.id === first)?.title).toBe('在吗');
  });

  it('reuses an empty conversation instead of piling up sessions', () => {
    const run = makeHarness();
    run.controller.hydrate();
    const first = run.activeId();
    run.controller.newSession();
    run.controller.newSession();
    expect(run.sessions()).toHaveLength(1);
    expect(run.activeId()).toBe(first);
  });

  it('stops a running reply when a new conversation starts', async () => {
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
    run.controller.newSession();
    await flush();
    expect(aborted).toBe(true);
    expect(run.controller.store.getState().messages).toHaveLength(1);
    expect(run.entries.some((entry) => entry.source === 'system')).toBe(true);
  });

  it('records the turn and the reply for the debug panel', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('今天好累');
    await run.controller.settled();
    expect(run.entries.some((entry) => entry.source === 'user' && entry.text === '今天好累')).toBe(
      true,
    );
    expect(run.entries.at(-1)?.source).toBe('demo');
    expect(run.entries.at(-1)?.text).toContain('回复完成');
  });

  it('marks a quick reply apart from typed turns', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.quickReply('摸摸头');
    await run.controller.settled();
    expect(run.entries.some((entry) => entry.source === 'quick')).toBe(true);
  });

  it('logs a forced emotion as a debug line', () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.forceEmotion('sleepy');
    expect(run.controller.store.getState().emotion).toBe('sleepy');
    expect(run.entries.at(-1)).toEqual({ source: 'debug', text: '情绪切到困了' });
  });

  it('clips a long line before it reaches the panel', () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.send('很'.repeat(80));
    const line = run.entries.find((entry) => entry.source === 'user')?.text ?? '';
    expect(line).toHaveLength(49);
    expect(line.endsWith('…')).toBe(true);
  });

  it('switches conversations and keeps each transcript', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.quickReply('摸摸头');
    await run.controller.settled();
    const first = run.activeId();
    expect(run.controller.store.getState().emotion).toBe('shy');
    run.controller.newSession();
    const second = run.activeId();
    run.controller.quickReply('夸夸我');
    await run.controller.settled();
    expect(run.activeId()).toBe(second);
    run.controller.switchSession(first);
    const state = run.controller.store.getState();
    expect(state.activeId).toBe(first);
    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]?.content).toBe('摸摸头');
    expect(state.emotion).toBe('shy');
    expect(run.stored(second)?.messages).toHaveLength(3);
  });

  it('renames a session and keeps the name', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    const id = run.activeId();
    run.controller.renameSession(id, '  我们的夜里  ');
    expect(run.sessions()[0]?.title).toBe('我们的夜里');
    run.controller.renameSession(id, '   ');
    expect(run.sessions()[0]?.title).toBe('我们的夜里');
    run.controller.quickReply('在吗');
    await run.controller.settled();
    expect(run.sessions()[0]?.title).toBe('我们的夜里');
  });

  it('deletes a session and falls back to the most recent one', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.quickReply('第一句');
    await run.controller.settled();
    const first = run.activeId();
    run.controller.newSession();
    run.controller.quickReply('第二句');
    await run.controller.settled();
    const second = run.activeId();
    run.controller.deleteSession(first);
    expect(run.sessions()).toHaveLength(1);
    expect(run.stored(first)).toBeNull();
    expect(run.activeId()).toBe(second);
    run.controller.deleteSession(second);
    expect(run.sessions()).toHaveLength(1);
    expect(run.controller.store.getState().messages[0]?.content).toBe(GREETING);
    expect(run.activeId()).not.toBe(second);
  });

  it('caps the number of sessions and drops the oldest body', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    const ids = [run.activeId()];
    for (let index = 0; index < SESSION_LIMIT + 2; index += 1) {
      run.controller.quickReply('第' + index + '句');
      await run.controller.settled();
      run.controller.newSession();
      ids.push(run.activeId());
    }
    expect(run.sessions()).toHaveLength(SESSION_LIMIT);
    expect(run.stored(ids[0] ?? '')).toBeNull();
  });

  it('migrates the single conversation into a session', () => {
    const run = makeHarness();
    run.raw.setItem(
      LEGACY_CHAT_KEY,
      JSON.stringify({
        version: 1,
        messages: [message('a', 'user', '旧话'), message('b', 'assistant', '嗯')],
        pendingId: null,
      }),
    );
    run.controller.hydrate();
    const state = run.controller.store.getState();
    expect(state.messages.map((item) => item.content)).toEqual(['旧话', '嗯']);
    expect(state.sessions[0]?.title).toBe('旧话');
    expect(run.raw.getItem(LEGACY_CHAT_KEY)).toBeNull();
    expect(run.entries.some((entry) => entry.text.includes('迁移'))).toBe(true);
  });

  it('drops a legacy record that only holds the greeting', () => {
    const run = makeHarness();
    run.raw.setItem(
      LEGACY_CHAT_KEY,
      JSON.stringify({
        version: 1,
        messages: [message('g', 'assistant', GREETING)],
        pendingId: null,
      }),
    );
    run.controller.hydrate();
    expect(run.raw.getItem(LEGACY_CHAT_KEY)).toBeNull();
    expect(run.sessions()).toHaveLength(1);
    expect(run.controller.store.getState().messages[0]?.content).toBe(GREETING);
  });

  it('evicts the least recently used session, not the oldest created', async () => {
    const clock = { value: 1000 };
    const run = makeHarness({ clock });
    run.controller.hydrate();
    const ids = [run.activeId()];
    for (let index = 0; index < SESSION_LIMIT - 1; index += 1) {
      clock.value += 1000;
      run.controller.quickReply('第' + index + '句');
      await run.controller.settled();
      run.controller.newSession();
      ids.push(run.activeId());
    }
    expect(run.sessions()).toHaveLength(SESSION_LIMIT);
    // Opening the oldest conversation counts as using it.
    clock.value += 1000;
    run.controller.switchSession(ids[0] ?? '');
    expect(run.sessions()[0]?.id).toBe(ids[0]);
    const victim = ids[1] ?? '';
    expect(run.sessions().at(-1)?.id).toBe(victim);
    clock.value += 1000;
    run.controller.quickReply('最后一轮');
    await run.controller.settled();
    run.controller.newSession();
    expect(run.sessions()).toHaveLength(SESSION_LIMIT);
    expect(run.stored(victim)).toBeNull();
    expect(run.stored(ids[0] ?? '')).not.toBeNull();
  });

  it('wipes every conversation from resetAll', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.quickReply('第一段');
    await run.controller.settled();
    const first = run.activeId();
    run.controller.newSession();
    run.controller.quickReply('第二段');
    await run.controller.settled();
    run.controller.resetAll();
    expect(run.sessions()).toHaveLength(1);
    expect(run.stored(first)).toBeNull();
    expect(run.controller.store.getState().messages[0]?.content).toBe(GREETING);
    expect(run.stored(run.activeId())?.messages).toHaveLength(1);
  });

  it('restores the list from a second controller over the same storage', async () => {
    const run = makeHarness();
    run.controller.hydrate();
    run.controller.quickReply('计划');
    await run.controller.settled();
    const first = run.activeId();
    run.controller.newSession();
    run.controller.quickReply('第二段');
    await run.controller.settled();
    const second = run.activeId();
    const again = createChatController({
      storage: run.storage,
      sleep: () => Promise.resolve(),
      now: () => 1000,
      newId: () => 'x' + Math.random().toString(36).slice(2, 8),
    });
    again.hydrate();
    expect(again.store.getState().activeId).toBe(second);
    expect(again.store.getState().sessions).toHaveLength(2);
    again.switchSession(first);
    expect(again.store.getState().messages[1]?.content).toBe('计划');
  });

  it('persists the partial reply in its own session when switching mid-stream', async () => {
    let release: (() => void) | undefined;
    const run = makeHarness({
      settings: liveSettings,
      apiKey: 'sk-test',
      transport: (_request, _signal, onDelta) =>
        new Promise<void>((resolve) => {
          onDelta('EMOTION: happy\n半');
          release = () => {
            onDelta('句');
            resolve();
          };
        }),
    });
    run.controller.hydrate();
    const first = run.activeId();
    run.controller.send('你好');
    await flush();
    run.controller.newSession();
    expect(run.stored(first)?.messages.at(-1)?.status).toBe('aborted');
    expect(run.stored(first)?.messages.at(-1)?.content).toBe('半');
    release?.();
    await run.controller.settled();
    expect(run.stored(first)?.messages.at(-1)?.content).toBe('半');
  });

  it('repairs an injected session id that storage would reject', () => {
    const raw = memoryStorage();
    const storage = createSessionStorage(raw);
    const controller = createChatController({
      storage,
      sleep: () => Promise.resolve(),
      now: () => 1000,
      newId: () => 'BAD_1',
    });
    controller.hydrate();
    const id = controller.store.getState().activeId ?? '';
    expect(id).toMatch(/^s-[a-z0-9-]+$/);
    expect(storage.readMessages(id)).not.toBeNull();
  });
});
