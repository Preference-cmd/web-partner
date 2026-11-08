export type Emotion = 'idle' | 'happy' | 'shy' | 'sleepy';
export type ChatMode = 'demo' | 'live';
export type MessageRole = 'user' | 'assistant';
export type MessageSource = 'demo' | 'model' | 'fallback';
export type MessageStatus = 'streaming' | 'done' | 'aborted';
export type ChatStatus = 'idle' | 'streaming' | 'error';

/** What one attachment carries in memory; storage keeps only the metadata. */
export interface MessageAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Base64 data URL. Memory only: it never reaches localStorage. */
  dataUrl?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  emotion?: Emotion;
  source?: MessageSource;
  status?: MessageStatus;
  at: number;
}

/** What the sidebar needs; the transcript itself lives in its own record. */
export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  messages: Message[];
  status: ChatStatus;
  abort: AbortController | null;
  pendingId: string | null;
  emotion: Emotion;
  sessions: SessionSummary[];
  activeId: string | null;
}

export type ModelContentPart = { type: 'text'; text: string } | { type: 'image'; image: string };

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ModelContentPart[];
}
