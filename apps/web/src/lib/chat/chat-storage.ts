import type { StringStorage } from './settings';
import type { Emotion, Message, MessageSource, MessageStatus } from './types';

export const CHAT_KEY = 'partner.chat.v1';
export const HISTORY_LIMIT = 100;

const EMOTIONS: readonly Emotion[] = ['idle', 'happy', 'shy', 'sleepy'];
const SOURCES: readonly MessageSource[] = ['demo', 'model', 'fallback'];
const STATUSES: readonly MessageStatus[] = ['streaming', 'done', 'aborted'];

export interface ChatSnapshot {
  messages: Message[];
  pendingId: string | null;
}

export interface ChatStorage {
  read: () => ChatSnapshot | null;
  write: (snapshot: ChatSnapshot) => void;
  clear: () => void;
}

function toMessage(value: unknown): Message | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.content !== 'string') return null;
  if (record.role !== 'user' && record.role !== 'assistant') return null;
  if (typeof record.at !== 'number') return null;
  const message: Message = {
    id: record.id,
    role: record.role,
    content: record.content,
    at: record.at,
  };
  if (typeof record.emotion === 'string' && EMOTIONS.includes(record.emotion as Emotion)) {
    message.emotion = record.emotion as Emotion;
  }
  if (typeof record.source === 'string' && SOURCES.includes(record.source as MessageSource)) {
    message.source = record.source as MessageSource;
  }
  if (typeof record.status === 'string' && STATUSES.includes(record.status as MessageStatus)) {
    message.status = record.status as MessageStatus;
  }
  return message;
}

export function createChatStorage(storage: StringStorage | undefined): ChatStorage {
  return {
    read() {
      if (!storage) return null;
      let raw: string | null;
      try {
        raw = storage.getItem(CHAT_KEY);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const record = parsed as Record<string, unknown>;
        if (!Array.isArray(record.messages)) return null;
        const messages = record.messages
          .map(toMessage)
          .filter((message): message is Message => message !== null);
        const pendingId = typeof record.pendingId === 'string' ? record.pendingId : null;
        return { messages: messages.slice(-HISTORY_LIMIT), pendingId };
      } catch {
        return null;
      }
    },
    write(snapshot) {
      if (!storage) return;
      const messages = snapshot.messages.slice(-HISTORY_LIMIT);
      try {
        storage.setItem(
          CHAT_KEY,
          JSON.stringify({ version: 1, messages, pendingId: snapshot.pendingId }),
        );
      } catch {
        // Persistence failed; the conversation continues in memory.
      }
    },
    clear() {
      try {
        storage?.removeItem(CHAT_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}
