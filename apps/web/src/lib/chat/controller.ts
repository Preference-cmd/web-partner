import { createStore, type StoreApi } from 'zustand/vanilla';
import { type LogSource, pushLog } from '../debug/log';
import { GREETING, pickDemoReply } from './demo';
import { EMOTION_LABEL, judgeEmotion } from './emotion';
import { createStreamParser } from './parser';
import {
  createSessionStorage,
  DEFAULT_TITLE,
  HISTORY_LIMIT,
  SESSION_LIMIT,
  type SessionStorage,
  TITLE_MAX,
  titleFromText,
} from './session-storage';
import { DEFAULT_SETTINGS, loadSettings, readApiKey, resolveMode, type Settings } from './settings';
import { type ChatRequest, type StreamTransport, streamChat } from './transport';
import type {
  ChatState,
  Emotion,
  Message,
  MessageSource,
  ModelMessage,
  SessionSummary,
} from './types';

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

/** One line for the debug panel; the controller owns what happened, the panel owns display. */
export interface ChatLog {
  source: LogSource;
  text: string;
}

export interface ChatControllerDeps {
  storage?: SessionStorage;
  getConfig?: () => ChatConfig;
  transport?: StreamTransport;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  newId?: () => string;
  random?: () => number;
  onLog?: (entry: ChatLog) => void;
}

export interface ChatController {
  store: StoreApi<ChatState>;
  hydrate: () => void;
  send: (text: string) => void;
  quickReply: (text: string) => void;
  stop: () => void;
  /** Empty the active conversation; the session itself stays in the list. */
  clear: () => void;
  /** A fresh conversation, or the empty one already open. */
  newSession: () => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  /** Wipe every conversation and start over, for the settings page. */
  resetAll: () => void;
  /** Debug control: skip the model and the classifier. */
  forceEmotion: (emotion: Emotion) => void;
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
  const storage = deps.storage ?? createSessionStorage(undefined);
  const transport = deps.transport ?? streamChat;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? defaultId;
  const random = deps.random ?? Math.random;
  const onLog = deps.onLog ?? (() => undefined);

  function clip(text: string, max = 48): string {
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
  }

  function record(source: LogSource, text: string): void {
    onLog({ source, text: clip(text) });
  }

  const getConfig = deps.getConfig ?? (() => ({ settings: { ...DEFAULT_SETTINGS }, apiKey: '' }));

  const store = createStore<ChatState>(() => ({
    messages: [],
    status: 'idle',
    abort: null,
    pendingId: null,
    emotion: 'idle',
    sessions: [],
    activeId: null,
  }));

  let turn = 0;
  let hydrated = false;
  let running: Promise<void> | null = null;
  let sessions: SessionSummary[] = [];
  let activeId: string | null = null;

  function sortSessions(list: SessionSummary[]): SessionSummary[] {
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }

  function writeIndex(): void {
    storage.writeIndex({ activeId, sessions });
  }

  function persist(pendingId: string | null): void {
    if (!activeId) return;
    storage.writeMessages(activeId, { messages: store.getState().messages, pendingId });
  }

  function lastEmotion(messages: readonly Message[]): Emotion {
    return (
      [...messages].reverse().find((message) => message.role === 'assistant' && message.emotion)
        ?.emotion ?? 'idle'
    );
  }

  function touchActive(at: number): void {
    if (!activeId) return;
    sessions = sortSessions(
      sessions.map((session) =>
        session.id === activeId ? { ...session, updatedAt: at } : session,
      ),
    );
    store.setState({ sessions });
    writeIndex();
  }

  function nameActive(title: string): void {
    if (!activeId) return;
    sessions = sessions.map((session) =>
      session.id === activeId && session.title === DEFAULT_TITLE ? { ...session, title } : session,
    );
    store.setState({ sessions });
    writeIndex();
  }

  function nextSessionId(): string {
    return 's-' + newId();
  }

  function openingMessage(): Message {
    return {
      id: newId(),
      role: 'assistant',
      content: GREETING,
      emotion: 'idle',
      source: 'demo',
      status: 'done',
      at: now(),
    };
  }

  function createSession(): void {
    const id = nextSessionId();
    const at = now();
    sessions = sortSessions([
      { id, title: DEFAULT_TITLE, createdAt: at, updatedAt: at },
      ...sessions,
    ]);
    // The oldest conversations fall off once the list is full; their bodies go with them.
    const dropped = sessions.slice(SESSION_LIMIT);
    for (const session of dropped) storage.removeMessages(session.id);
    if (dropped.length > 0) record('system', '会话已满，移除最久未更新的一段');
    sessions = sessions.slice(0, SESSION_LIMIT);
    activeId = id;
    const messages = [openingMessage()];
    store.setState({
      messages,
      sessions,
      activeId,
      emotion: 'idle',
      status: 'idle',
      abort: null,
      pendingId: null,
    });
    storage.writeMessages(id, { messages, pendingId: null });
    writeIndex();
    record('system', '新建对话');
  }

  function showSession(id: string): void {
    const stored = storage.readMessages(id);
    const messages = stored?.messages ?? [openingMessage()];
    activeId = id;
    store.setState({
      messages,
      emotion: lastEmotion(messages),
      status: 'idle',
      abort: null,
      pendingId: null,
      activeId,
      sessions,
    });
    if (!stored) persist(null);
    writeIndex();
  }

  /** The single-conversation record, lifted into the session list once. */
  function migrateLegacy(): boolean {
    const legacy = storage.readLegacy();
    if (!legacy) return false;
    storage.clearLegacy();
    const firstUser = legacy.messages.find((message) => message.role === 'user');
    if (!firstUser) return false;
    const id = nextSessionId();
    const at = now();
    sessions = [{ id, title: titleFromText(firstUser.content), createdAt: at, updatedAt: at }];
    activeId = id;
    storage.writeMessages(id, {
      messages: legacy.messages.slice(-HISTORY_LIMIT),
      pendingId: legacy.pendingId,
    });
    writeIndex();
    record('system', '旧对话已迁移');
    return true;
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
    const reply = store.getState().messages.find((message) => message.id === id);
    if (status === 'aborted') record('system', '回复已中断');
    else record(source, `回复完成 · ${Array.from(reply?.content ?? '').length} 字`);
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
      record('system', `演示流断了：${String(error)}`);
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
      onMissingHeader: () => record('system', '回复没有情绪标签，按内容判断'),
    });
    try {
      await transport(request, signal, (chunk) => parser.push(chunk));
      parser.flush();
      if (turnId !== turn || signal.aborted) return;
      const current = store.getState().messages.find((message) => message.id === replyId);
      if (!current?.content) {
        // An upstream error can surface as an empty stream with a 200 status.
        record('fallback', '模型没有返回文本，改用模板');
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
        record('fallback', `模型流断了（已收到 ${current.content.length} 字）：${String(error)}`);
        patch(replyId, { emotion });
        setEmotion(emotion);
      } else {
        record('fallback', `模型请求失败，改用模板：${String(error)}`);
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
    record(local ? 'quick' : 'user', text);
    abortCurrent();
    const config = getConfig();
    const useModel = !local && resolveMode(config.settings, config.apiKey) === 'live';
    const firstUser = !store.getState().messages.some((message) => message.role === 'user');
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
    if (firstUser) nameActive(titleFromText(text));
    touchActive(now());
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
    const index = storage.readIndex();
    if (index) {
      sessions = sortSessions(index.sessions).slice(0, SESSION_LIMIT);
      activeId = index.activeId ?? sessions[0]?.id ?? null;
    } else if (!migrateLegacy()) {
      createSession();
      return;
    }
    if (!activeId) {
      createSession();
      return;
    }
    const stored = storage.readMessages(activeId);
    if (!stored) {
      store.setState({ messages: [openingMessage()], sessions, activeId, emotion: 'idle' });
      persist(null);
      writeIndex();
      return;
    }
    let interrupted = false;
    const messages = stored.messages.map((message) => {
      if (stored.pendingId && message.id === stored.pendingId && message.status === 'streaming') {
        interrupted = true;
        return { ...message, status: 'aborted' as const };
      }
      return message;
    });
    store.setState({
      messages,
      sessions,
      activeId,
      status: 'idle',
      pendingId: null,
      emotion: lastEmotion(messages),
    });
    if (interrupted) persist(null);
  }

  function clear(): void {
    hydrate();
    abortCurrent();
    store.setState({ messages: [], status: 'idle', abort: null, pendingId: null, emotion: 'idle' });
    persist(null);
  }

  function newSession(): void {
    hydrate();
    abortCurrent();
    const active = sessions.find((session) => session.id === activeId);
    const hasUser = store.getState().messages.some((message) => message.role === 'user');
    if (active && !hasUser) {
      store.setState({
        messages: [openingMessage()],
        emotion: 'idle',
        status: 'idle',
        abort: null,
        pendingId: null,
      });
      persist(null);
      writeIndex();
      return;
    }
    createSession();
  }

  function switchSession(id: string): void {
    hydrate();
    if (id === activeId) return;
    const target = sessions.find((session) => session.id === id);
    if (!target) return;
    abortCurrent();
    showSession(id);
    record('system', `切到「${target.title}」`);
  }

  function renameSession(id: string, title: string): void {
    hydrate();
    const clean = title.trim().slice(0, TITLE_MAX);
    const target = sessions.find((session) => session.id === id);
    if (!target || !clean || clean === target.title) return;
    sessions = sessions.map((session) =>
      session.id === id ? { ...session, title: clean } : session,
    );
    store.setState({ sessions });
    writeIndex();
    record('system', `重命名「${clean}」`);
  }

  function deleteSession(id: string): void {
    hydrate();
    const target = sessions.find((session) => session.id === id);
    if (!target) return;
    const wasActive = id === activeId;
    if (wasActive) abortCurrent();
    sessions = sessions.filter((session) => session.id !== id);
    storage.removeMessages(id);
    store.setState({ sessions });
    record('system', `删除「${target.title}」`);
    if (!wasActive) {
      writeIndex();
      return;
    }
    const next = sessions[0];
    if (next) {
      showSession(next.id);
      return;
    }
    activeId = null;
    store.setState({ activeId: null, messages: [] });
    createSession();
  }

  function resetAll(): void {
    hydrate();
    abortCurrent();
    storage.clearAll();
    activeId = nextSessionId();
    const at = now();
    const messages = [openingMessage()];
    sessions = [{ id: activeId, title: DEFAULT_TITLE, createdAt: at, updatedAt: at }];
    store.setState({
      messages,
      sessions,
      activeId,
      emotion: 'idle',
      status: 'idle',
      abort: null,
      pendingId: null,
    });
    storage.writeMessages(activeId, { messages, pendingId: null });
    writeIndex();
    record('system', '已清空全部会话');
  }

  function forceEmotion(emotion: Emotion): void {
    setEmotion(emotion);
    record('debug', `情绪切到${EMOTION_LABEL[emotion]}`);
  }

  return {
    store,
    hydrate,
    send: (text) => startTurn(text, false),
    quickReply: (text) => startTurn(text, true),
    stop: () => abortCurrent(),
    clear,
    newSession,
    switchSession,
    renameSession,
    deleteSession,
    resetAll,
    forceEmotion,
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
      storage:
        typeof window === 'undefined' ? undefined : createSessionStorage(window.localStorage),
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
      onLog: (entry) => pushLog(entry.source, entry.text),
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => registry.__partnerChat?.stop());
    }
  }
  return registry.__partnerChat;
}
