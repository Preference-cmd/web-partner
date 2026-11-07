import { createStore, type StoreApi } from 'zustand/vanilla';
import { type ChatStorage, createChatStorage } from './chat-storage';
import { GREETING, pickDemoReply } from './demo';
import { judgeEmotion } from './emotion';
import { createStreamParser } from './parser';
import { DEFAULT_SETTINGS, loadSettings, readApiKey, resolveMode, type Settings } from './settings';
import { type ChatRequest, type StreamTransport, streamChat } from './transport';
import type { ChatState, Emotion, Message, MessageSource, ModelMessage } from './types';

export const CONTEXT_MESSAGES = 20;
export const CONTEXT_CHARS = 6000;

export const SYSTEM_PROMPT = [
  '你是小鲸，一个安静、体贴的伴侣型角色。',
  '用中文回答，语气自然，一到两句，不用列表，不用 Markdown。',
  '回复的第一行只写情绪标签：EMOTION: idle|happy|shy|sleepy，然后换行写正文。',
].join('\n');

export interface ChatConfig {
  settings: Settings;
  apiKey: string;
}

export interface ChatControllerDeps {
  storage?: ChatStorage;
  getConfig?: () => ChatConfig;
  transport?: StreamTransport;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  newId?: () => string;
  random?: () => number;
  onLog?: (line: string) => void;
}

export interface ChatController {
  store: StoreApi<ChatState>;
  hydrate: () => void;
  send: (text: string) => void;
  quickReply: (text: string) => void;
  stop: () => void;
  clear: () => void;
  settled: () => Promise<void>;
}

let idCounter = 0;

function defaultId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(abortError());
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Latest turns within the message-count and character budgets. */
export function selectContext(
  messages: readonly Message[],
  limit = CONTEXT_MESSAGES,
  maxChars = CONTEXT_CHARS,
): Message[] {
  const usable = messages.filter((message) => message.content.trim().length > 0);
  const window = usable.slice(-limit);
  let total = window.reduce((sum, message) => sum + message.content.length, 0);
  let start = 0;
  while (total > maxChars && start < window.length - 1) {
    total -= window[start]?.content.length ?? 0;
    start += 1;
  }
  return window.slice(start);
}

export function buildModelMessages(history: readonly Message[]): ModelMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...selectContext(history).map((message) => ({ role: message.role, content: message.content })),
  ];
}

export function createChatController(deps: ChatControllerDeps = {}): ChatController {
  const storage = deps.storage ?? createChatStorage(undefined);
  const transport = deps.transport ?? streamChat;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? defaultId;
  const random = deps.random ?? Math.random;
  const log = deps.onLog ?? (() => undefined);
  const getConfig = deps.getConfig ?? (() => ({ settings: { ...DEFAULT_SETTINGS }, apiKey: '' }));

  const store = createStore<ChatState>(() => ({
    messages: [],
    status: 'idle',
    abort: null,
    pendingId: null,
    emotion: 'idle',
  }));

  let turn = 0;
  let hydrated = false;
  let running: Promise<void> | null = null;

  function persist(pendingId: string | null): void {
    storage.write({ messages: store.getState().messages, pendingId });
  }

  function patch(id: string, patch_: Partial<Message>): void {
    const messages = store
      .getState()
      .messages.map((message) => (message.id === id ? { ...message, ...patch_ } : message));
    store.setState({ messages });
  }

  function appendText(id: string, text: string): void {
    if (!text) return;
    const messages = store
      .getState()
      .messages.map((message) =>
        message.id === id ? { ...message, content: message.content + text } : message,
      );
    store.setState({ messages });
  }

  function setEmotion(emotion: Emotion): void {
    if (store.getState().emotion !== emotion) store.setState({ emotion });
  }

  function previousReply(exceptId: string): string {
    const messages = store.getState().messages;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message && message.id !== exceptId && message.role === 'assistant' && message.content) {
        return message.content;
      }
    }
    return '';
  }

  function settle(): void {
    store.setState({ status: 'idle', abort: null, pendingId: null });
    persist(null);
    running = null;
  }

  function finalize(id: string, source: MessageSource, status: 'done' | 'aborted' = 'done'): void {
    patch(id, { status, source });
    settle();
  }

  function abortCurrent(): void {
    const { abort, pendingId } = store.getState();
    if (abort) abort.abort();
    if (!pendingId) {
      store.setState({ abort: null });
      return;
    }
    const message = store.getState().messages.find((item) => item.id === pendingId);
    if (!message) {
      settle();
      return;
    }
    // Keep even an empty reply: the interruption itself is the information.
    finalize(message.id, message.source ?? 'demo', 'aborted');
  }

  async function runDemo(
    turnId: number,
    replyId: string,
    userText: string,
    signal: AbortSignal,
  ): Promise<void> {
    const emotion = judgeEmotion(userText);
    patch(replyId, { emotion });
    setEmotion(emotion);
    try {
      await sleep(220, signal);
      const replyText = pickDemoReply(emotion, previousReply(replyId), random);
      for (const char of Array.from(replyText)) {
        await sleep(14, signal);
        if (turnId !== turn || signal.aborted) return;
        appendText(replyId, char);
      }
      if (turnId !== turn || signal.aborted) return;
      finalize(replyId, 'demo');
    } catch (error) {
      if (signal.aborted || turnId !== turn) return;
      log(`demo stream failed: ${String(error)}`);
      finalize(replyId, 'demo');
    }
  }

  async function runLive(
    turnId: number,
    replyId: string,
    userText: string,
    config: ChatConfig,
    signal: AbortSignal,
  ): Promise<void> {
    const history = store.getState().messages.filter((message) => message.id !== replyId);
    const request: ChatRequest = {
      endpoint: config.settings.endpoint,
      apiKey: config.apiKey,
      model: config.settings.model,
      messages: buildModelMessages(history),
      direct: config.settings.direct,
    };
    const parser = createStreamParser({
      onEmotion: (emotion) => {
        if (turnId !== turn || signal.aborted) return;
        patch(replyId, { emotion });
        setEmotion(emotion);
      },
      onText: (chunk) => {
        if (turnId !== turn || signal.aborted) return;
        appendText(replyId, chunk);
      },
      onMissingHeader: () => log('reply had no EMOTION tag; judged locally'),
    });
    try {
      await transport(request, signal, (chunk) => parser.push(chunk));
      parser.flush();
      if (turnId !== turn || signal.aborted) return;
      const current = store.getState().messages.find((message) => message.id === replyId);
      if (!current?.content) {
        // An upstream error can surface as an empty stream with a 200 status.
        log('model returned no text; using a template');
        const fallback = pickDemoReply(judgeEmotion(userText), previousReply(replyId), random);
        const emotion = judgeEmotion(fallback);
        patch(replyId, { content: fallback, emotion });
        setEmotion(emotion);
        finalize(replyId, 'fallback');
        return;
      }
      finalize(replyId, 'model');
    } catch (error) {
      if (signal.aborted || turnId !== turn) return;
      parser.flush();
      const current = store.getState().messages.find((message) => message.id === replyId);
      if (current?.content) {
        const emotion = current.emotion ?? judgeEmotion(current.content);
        log(`model stream failed after ${current.content.length} chars: ${String(error)}`);
        patch(replyId, { emotion });
        setEmotion(emotion);
      } else {
        log(`model request failed; using a template: ${String(error)}`);
        const fallback = pickDemoReply(judgeEmotion(userText), previousReply(replyId), random);
        const emotion = judgeEmotion(fallback);
        patch(replyId, { content: fallback, emotion });
        setEmotion(emotion);
      }
      finalize(replyId, 'fallback');
    }
  }

  function startTurn(raw: string, local: boolean): void {
    const text = raw.trim();
    if (!text) return;
    abortCurrent();
    const config = getConfig();
    const useModel = !local && resolveMode(config.settings, config.apiKey) === 'live';
    const user: Message = { id: newId(), role: 'user', content: text, at: now() };
    const reply: Message = {
      id: newId(),
      role: 'assistant',
      content: '',
      source: useModel ? 'model' : 'demo',
      status: 'streaming',
      at: now(),
    };
    store.setState((state) => ({
      messages: [...state.messages, user, reply],
      status: 'streaming',
      pendingId: reply.id,
    }));
    persist(reply.id);

    const controller = new AbortController();
    turn += 1;
    const turnId = turn;
    store.setState({ abort: controller });
    running = useModel
      ? runLive(turnId, reply.id, text, config, controller.signal)
      : runDemo(turnId, reply.id, text, controller.signal);
  }

  function hydrate(): void {
    if (hydrated) return;
    hydrated = true;
    const snapshot = storage.read();
    if (!snapshot) {
      const greeting: Message = {
        id: newId(),
        role: 'assistant',
        content: GREETING,
        emotion: 'idle',
        source: 'demo',
        status: 'done',
        at: now(),
      };
      store.setState({ messages: [greeting] });
      persist(null);
      return;
    }
    let interrupted = false;
    const messages = snapshot.messages.map((message) => {
      if (
        snapshot.pendingId &&
        message.id === snapshot.pendingId &&
        message.status === 'streaming'
      ) {
        interrupted = true;
        return { ...message, status: 'aborted' as const };
      }
      return message;
    });
    const lastEmotion = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.emotion)?.emotion;
    store.setState({
      messages,
      status: 'idle',
      pendingId: null,
      emotion: lastEmotion ?? 'idle',
    });
    if (interrupted) persist(null);
  }

  function clear(): void {
    abortCurrent();
    hydrated = true;
    storage.clear();
    store.setState({ messages: [], status: 'idle', abort: null, pendingId: null, emotion: 'idle' });
  }

  return {
    store,
    hydrate,
    send: (text) => startTurn(text, false),
    quickReply: (text) => startTurn(text, true),
    stop: () => abortCurrent(),
    clear,
    settled: () => running ?? Promise.resolve(),
  };
}

interface ChatGlobal {
  __partnerChat?: ChatController;
}

/**
 * One owner per page: the entry chunk can be evaluated again after a client
 * navigation, so the controller lives on the global rather than a module.
 */
export function getChatController(): ChatController {
  const registry = globalThis as ChatGlobal;
  if (!registry.__partnerChat) {
    registry.__partnerChat = createChatController({
      storage: typeof window === 'undefined' ? undefined : createChatStorage(window.localStorage),
      getConfig: () => {
        if (typeof window === 'undefined') {
          return { settings: { ...DEFAULT_SETTINGS }, apiKey: '' };
        }
        return {
          settings: loadSettings(window.localStorage),
          apiKey: readApiKey(window.sessionStorage, window.localStorage),
        };
      },
      transport: streamChat,
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => registry.__partnerChat?.stop());
    }
  }
  return registry.__partnerChat;
}
