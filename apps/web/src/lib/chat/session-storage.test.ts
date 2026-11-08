import { describe, expect, it } from 'vitest';
import type { StringStorage } from '../storage';
import {
  createSessionStorage,
  DEFAULT_TITLE,
  HISTORY_LIMIT,
  LEGACY_CHAT_KEY,
  parseSessionIndex,
  SESSION_LIMIT,
  SESSION_PREFIX,
  SESSIONS_KEY,
  sessionKey,
  TITLE_MAX,
  titleFromText,
} from './session-storage';
import type { Message } from './types';

function memoryStorage(initial: Record<string, string> = {}): StringStorage {
  const map = new Map(Object.entries(initial));
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

function message(index: number, role: 'user' | 'assistant' = 'user'): Message {
  return { id: 'm' + index, role, content: '内容' + index, at: index };
}

function summary(id: string, updatedAt: number, title = DEFAULT_TITLE) {
  return { id: 's-' + id, title, createdAt: updatedAt, updatedAt };
}

describe('session storage', () => {
  it('keeps attachment metadata but never the data URL', () => {
    const raw = memoryStorage();
    const storage = createSessionStorage(raw);
    storage.writeMessages('s-a', {
      messages: [
        {
          id: 'm0',
          role: 'user',
          content: '看看',
          at: 1,
          attachments: [
            {
              id: 'a1',
              name: 'hair.png',
              mime: 'image/png',
              size: 70,
              dataUrl: 'data:image/png;base64,AAAA',
            },
          ],
        },
      ],
      pendingId: null,
    });
    const stored = raw.getItem(sessionKey('s-a')) ?? '';
    expect(stored).not.toContain('data:image');
    expect(storage.readMessages('s-a')?.messages[0]?.attachments).toEqual([
      { id: 'a1', name: 'hair.png', mime: 'image/png', size: 70 },
    ]);
  });

  it('round-trips an index and a transcript', () => {
    const raw = memoryStorage();
    const storage = createSessionStorage(raw);
    storage.writeIndex({ activeId: 's-a', sessions: [summary('a', 2), summary('b', 1)] });
    storage.writeMessages('s-a', { messages: [message(0)], pendingId: 'm0' });
    expect(storage.readIndex()?.activeId).toBe('s-a');
    expect(storage.readIndex()?.sessions).toHaveLength(2);
    expect(storage.readMessages('s-a')).toEqual({
      messages: [message(0)],
      pendingId: 'm0',
    });
  });

  it('sorts by activity and keeps the newest sessions', () => {
    const sessions = Array.from({ length: SESSION_LIMIT + 3 }, (_, index) =>
      summary('x' + index, index),
    );
    const parsed = parseSessionIndex(JSON.stringify({ activeId: 's-x0', sessions }));
    expect(parsed?.sessions).toHaveLength(SESSION_LIMIT);
    expect(parsed?.sessions[0]?.id).toBe('s-x' + (SESSION_LIMIT + 2));
  });

  it('repairs a missing or unknown active session and drops junk', () => {
    const parsed = parseSessionIndex(
      JSON.stringify({
        activeId: 's-missing',
        sessions: [
          summary('a', 1),
          { id: 'nope', title: 'x' },
          { id: 's-a', title: 'dup' },
          'junk',
        ],
      }),
    );
    expect(parsed?.sessions).toHaveLength(1);
    expect(parsed?.activeId).toBe('s-a');
  });

  it('falls back to the default title and clips a long one', () => {
    const parsed = parseSessionIndex(
      JSON.stringify({
        sessions: [
          { id: 's-a', title: '   ', createdAt: 0 },
          { id: 's-b', title: '长'.repeat(60) },
        ],
      }),
    );
    expect(parsed?.sessions.map((item) => item.title)).toEqual([
      DEFAULT_TITLE,
      '长'.repeat(TITLE_MAX),
    ]);
  });

  it('returns null for a missing or corrupt record', () => {
    const storage = createSessionStorage(memoryStorage());
    expect(storage.readIndex()).toBeNull();
    expect(storage.readMessages('s-a')).toBeNull();
  });

  it('drops malformed messages but keeps the rest and the pending id', () => {
    const raw = memoryStorage();
    raw.setItem(
      sessionKey('s-a'),
      JSON.stringify({
        version: 1,
        messages: [message(0), { id: 'bad', role: 'user' }, 'nope'],
        pendingId: 'm0',
      }),
    );
    const restored = createSessionStorage(raw).readMessages('s-a');
    expect(restored?.messages).toHaveLength(1);
    expect(restored?.pendingId).toBe('m0');
  });

  it('keeps at most the history limit', () => {
    const storage = createSessionStorage(memoryStorage());
    const messages = Array.from({ length: HISTORY_LIMIT + 20 }, (_, index) => message(index));
    storage.writeMessages('s-a', { messages, pendingId: null });
    const restored = storage.readMessages('s-a');
    expect(restored?.messages).toHaveLength(HISTORY_LIMIT);
    expect(restored?.messages[0]?.content).toBe('内容20');
  });

  it('refuses an id that is not a session id', () => {
    const raw = memoryStorage();
    const storage = createSessionStorage(raw);
    storage.writeMessages('../evil', { messages: [message(0)], pendingId: null });
    expect(raw.getItem(sessionKey('../evil'))).toBeNull();
    expect(storage.readMessages('../evil')).toBeNull();
  });

  it('reads and clears the legacy conversation', () => {
    const raw = memoryStorage({
      [LEGACY_CHAT_KEY]: JSON.stringify({ version: 1, messages: [message(0)], pendingId: null }),
    });
    const storage = createSessionStorage(raw);
    expect(storage.readLegacy()?.messages).toHaveLength(1);
    storage.clearLegacy();
    expect(raw.getItem(LEGACY_CHAT_KEY)).toBeNull();
  });

  it('clears the index, the legacy record and every transcript', () => {
    const raw = memoryStorage();
    const storage = createSessionStorage(raw);
    storage.writeIndex({ activeId: 's-a', sessions: [summary('a', 1)] });
    storage.writeMessages('s-a', { messages: [message(0)], pendingId: null });
    storage.writeMessages('s-orphan', { messages: [message(0)], pendingId: null });
    raw.setItem(LEGACY_CHAT_KEY, '{"messages":[]}');
    storage.clearAll();
    expect(raw.getItem(SESSIONS_KEY)).toBeNull();
    expect(raw.getItem(LEGACY_CHAT_KEY)).toBeNull();
    expect(raw.getItem(sessionKey('s-a'))).toBeNull();
    expect(raw.getItem(sessionKey('s-orphan'))).toBeNull();
  });

  it('leaves unrelated keys alone when clearing', () => {
    const raw = memoryStorage({ 'partner.settings.v1': '{}', 'other.key': '1' });
    createSessionStorage(raw).clearAll();
    expect(raw.getItem('partner.settings.v1')).toBe('{}');
    expect(raw.getItem('other.key')).toBe('1');
  });

  it('derives a title from the first message line', () => {
    expect(titleFromText('今天好累\n想睡觉')).toBe('今天好累');
    expect(titleFromText('   ')).toBe(DEFAULT_TITLE);
    const long = '长'.repeat(40);
    expect(titleFromText(long)).toBe('长'.repeat(24) + '…');
  });

  it('marks the session prefix so bodies never collide with the index', () => {
    expect(SESSION_PREFIX).toBe('partner.session.');
    expect(sessionKey('s-a')).toBe('partner.session.s-a.v1');
  });
});
