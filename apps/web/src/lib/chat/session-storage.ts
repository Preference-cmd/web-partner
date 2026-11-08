import { dropKey, keysOf, readKey, type StringStorage, writeKey } from '../storage';
import type {
  Emotion,
  Message,
  MessageAttachment,
  MessageSource,
  MessageStatus,
  SessionSummary,
} from './types';

export const SESSIONS_KEY = 'partner.sessions.v1';
export const SESSION_PREFIX = 'partner.session.';
export const LEGACY_CHAT_KEY = 'partner.chat.v1';

export const HISTORY_LIMIT = 100;
export const SESSION_LIMIT = 20;
export const TITLE_MAX = 40;
export const DEFAULT_TITLE = '新的对话';
const AUTO_TITLE_MAX = 24;
const ID_PATTERN = /^s-[a-z0-9-]{1,40}$/;

const EMOTIONS: readonly Emotion[] = ['idle', 'happy', 'shy', 'sleepy'];
const SOURCES: readonly MessageSource[] = ['demo', 'model', 'fallback'];
const STATUSES: readonly MessageStatus[] = ['streaming', 'done', 'aborted'];

export interface SessionIndex {
  activeId: string | null;
  sessions: SessionSummary[];
}

export interface SessionMessages {
  messages: Message[];
  pendingId: string | null;
}

export interface SessionStorage {
  readIndex: () => SessionIndex | null;
  writeIndex: (index: SessionIndex) => void;
  readMessages: (id: string) => SessionMessages | null;
  writeMessages: (id: string, snapshot: SessionMessages) => void;
  removeMessages: (id: string) => void;
  /** The single-conversation record the session model replaced. */
  readLegacy: () => SessionMessages | null;
  clearLegacy: () => void;
  clearAll: () => void;
}

export function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}.v1`;
}

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** The first line of the first message, clipped so a sidebar row keeps working. */
export function titleFromText(text: string, max = AUTO_TITLE_MAX): string {
  const line = (text.split('\n')[0] ?? '').trim();
  const chars = Array.from(line);
  if (chars.length === 0) return DEFAULT_TITLE;
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : line;
}

function toAttachment(value: unknown): MessageAttachment | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  if (typeof record.mime !== 'string' || typeof record.size !== 'number') return null;
  return {
    id: record.id,
    name: record.name.slice(0, 120),
    mime: record.mime,
    size: record.size,
  };
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
  if (Array.isArray(record.attachments)) {
    const attachments = record.attachments
      .map(toAttachment)
      .filter((item): item is MessageAttachment => item !== null);
    if (attachments.length > 0) message.attachments = attachments;
  }
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

export function parseSessionMessages(raw: string | null): SessionMessages | null {
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
}

export function parseSessionIndex(raw: string | null): SessionIndex | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.sessions)) return null;
    const seen = new Set<string>();
    const sessions: SessionSummary[] = [];
    for (const value of record.sessions) {
      if (typeof value !== 'object' || value === null) continue;
      const item = value as Record<string, unknown>;
      if (!isSessionId(item.id) || seen.has(item.id)) continue;
      const createdAt =
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : 0;
      const updatedAt =
        typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
          ? item.updatedAt
          : createdAt;
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, TITLE_MAX) : '';
      seen.add(item.id);
      sessions.push({ id: item.id, title: title || DEFAULT_TITLE, createdAt, updatedAt });
    }
    if (sessions.length === 0) return null;
    sessions.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    const kept = sessions.slice(0, SESSION_LIMIT);
    const activeId =
      typeof record.activeId === 'string' && kept.some((item) => item.id === record.activeId)
        ? record.activeId
        : (kept[0]?.id ?? null);
    return { activeId, sessions: kept };
  } catch {
    return null;
  }
}

export function createSessionStorage(storage: StringStorage | undefined): SessionStorage {
  return {
    readIndex() {
      return parseSessionIndex(readKey(storage, SESSIONS_KEY));
    },
    writeIndex(index) {
      writeKey(
        storage,
        SESSIONS_KEY,
        JSON.stringify({
          version: 1,
          activeId: index.activeId,
          sessions: index.sessions.slice(0, SESSION_LIMIT),
        }),
      );
    },
    readMessages(id) {
      if (!isSessionId(id)) return null;
      return parseSessionMessages(readKey(storage, sessionKey(id)));
    },
    writeMessages(id, snapshot) {
      if (!isSessionId(id)) return;
      writeKey(
        storage,
        sessionKey(id),
        JSON.stringify({
          version: 1,
          // Data URLs stay in memory: localStorage only keeps what the chip needs.
          messages: snapshot.messages.slice(-HISTORY_LIMIT).map(({ attachments, ...message }) => ({
            ...message,
            ...(attachments?.length
              ? {
                  attachments: attachments.map(({ id: attachmentId, name, mime, size }) => ({
                    id: attachmentId,
                    name,
                    mime,
                    size,
                  })),
                }
              : {}),
          })),
          pendingId: snapshot.pendingId,
        }),
      );
    },
    removeMessages(id) {
      if (isSessionId(id)) dropKey(storage, sessionKey(id));
    },
    readLegacy() {
      const raw = readKey(storage, LEGACY_CHAT_KEY);
      if (!raw) return null;
      const parsed = parseSessionMessages(raw);
      // A record that cannot be parsed will never migrate; drop it instead of reading it again.
      if (!parsed) dropKey(storage, LEGACY_CHAT_KEY);
      return parsed;
    },
    clearLegacy() {
      dropKey(storage, LEGACY_CHAT_KEY);
    },
    clearAll() {
      const index = parseSessionIndex(readKey(storage, SESSIONS_KEY));
      for (const key of keysOf(storage)) {
        if (key.startsWith(SESSION_PREFIX)) dropKey(storage, key);
      }
      // A storage that cannot be enumerated still clears the sessions it knows about.
      for (const session of index?.sessions ?? []) dropKey(storage, sessionKey(session.id));
      dropKey(storage, SESSIONS_KEY);
      dropKey(storage, LEGACY_CHAT_KEY);
    },
  };
}
