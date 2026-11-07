import { describe, expect, it } from 'vitest';
import { CHAT_KEY, createChatStorage, HISTORY_LIMIT } from './chat-storage';
import type { StringStorage } from './settings';
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

function message(index: number): Message {
  return { id: 'm' + index, role: 'user', content: '内容' + index, at: index };
}

describe('chat storage', () => {
  it('keeps at most the history limit', () => {
    const raw = memoryStorage();
    const storage = createChatStorage(raw);
    const messages = Array.from({ length: HISTORY_LIMIT + 20 }, (_, index) => message(index));
    storage.write({ messages, pendingId: null });
    const restored = storage.read();
    expect(restored?.messages).toHaveLength(HISTORY_LIMIT);
    expect(restored?.messages[0]?.content).toBe('内容20');
  });

  it('drops malformed records but keeps valid ones and the pending id', () => {
    const raw = memoryStorage();
    raw.setItem(
      CHAT_KEY,
      JSON.stringify({
        version: 1,
        messages: [message(0), { id: 'bad', role: 'user' }, 'nope'],
        pendingId: 'm0',
      }),
    );
    const restored = createChatStorage(raw).read();
    expect(restored?.messages).toHaveLength(1);
    expect(restored?.pendingId).toBe('m0');
  });

  it('returns null for a missing or corrupt record', () => {
    const raw = memoryStorage();
    const storage = createChatStorage(raw);
    expect(storage.read()).toBeNull();
    raw.setItem(CHAT_KEY, 'not json');
    expect(storage.read()).toBeNull();
    expect(createChatStorage(undefined).read()).toBeNull();
  });

  it('clears the stored record', () => {
    const raw = memoryStorage();
    const storage = createChatStorage(raw);
    storage.write({ messages: [message(0)], pendingId: null });
    storage.clear();
    expect(storage.read()).toBeNull();
  });
});
