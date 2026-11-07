export type Emotion = 'idle' | 'happy' | 'shy' | 'sleepy';
export type ChatMode = 'demo' | 'live';
export type MessageRole = 'user' | 'assistant';
export type MessageSource = 'demo' | 'model' | 'fallback';
export type MessageStatus = 'streaming' | 'done' | 'aborted';
export type ChatStatus = 'idle' | 'streaming' | 'error';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  emotion?: Emotion;
  source?: MessageSource;
  status?: MessageStatus;
  at: number;
}

export interface ChatState {
  messages: Message[];
  status: ChatStatus;
  abort: AbortController | null;
  pendingId: string | null;
  emotion: Emotion;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
