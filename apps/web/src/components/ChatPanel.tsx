import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { getChatController } from '../lib/chat/controller';
import { QUICK_ACTIONS } from '../lib/chat/demo';
import { applyAppearance, loadSettings, readApiKey, resolveMode } from '../lib/chat/settings';
import type { ChatMode, Emotion, Message, MessageSource } from '../lib/chat/types';

const SOURCE_LABEL: Record<MessageSource, string> = {
  demo: '演示',
  model: '模型',
  fallback: '回落',
};

const EMOTION_LABEL: Record<Emotion, string> = {
  idle: '平静',
  happy: '开心',
  shy: '害羞',
  sleepy: '困了',
};

function Typing() {
  return (
    <span className="typing">
      <i />
      <i />
      <i />
    </span>
  );
}

function MessageRow({ message }: { message: Message }) {
  const mine = message.role === 'user';
  const waiting = !mine && message.status === 'streaming' && message.content.length === 0;
  // An interrupted reply with no text is news, not a bubble.
  const interrupted = !mine && message.status === 'aborted' && message.content.length === 0;
  return (
    <div className={`msg ${mine ? 'me' : 'bot'}`}>
      <div className="name">
        {mine ? '你' : SOURCE_LABEL[message.source ?? 'demo']}
        {message.status === 'aborted' ? <span className="note">已中断</span> : null}
      </div>
      {interrupted ? null : (
        <div className="bubble">
          {message.content}
          {waiting ? <Typing /> : null}
        </div>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const controller = getChatController();
  const messages = useStore(controller.store, (state) => state.messages);
  const status = useStore(controller.store, (state) => state.status);
  const emotion = useStore(controller.store, (state) => state.emotion);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<ChatMode>('demo');
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    controller.hydrate();
  }, [controller]);

  useEffect(() => {
    document.documentElement.dataset.emotion = emotion;
  }, [emotion]);

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    applyAppearance(document.documentElement, stored);
    setMode(resolveMode(stored, readApiKey(window.sessionStorage, window.localStorage)));
  }, []);

  // The stage needs the panel's height to keep the figure clear of it.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const root = document.documentElement;
    const sync = (): void => {
      const height = node.offsetHeight;
      const lift = Math.max(0, Math.min(150, height - root.clientHeight * 0.46));
      root.style.setProperty('--panel-h', `${height}px`);
      root.style.setProperty('--panel-lift', `${Math.round(lift)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  // "新对话" is static sidebar markup: intercepted here, or honoured after landing on /?new=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    controller.restart();
    window.history.replaceState(null, '', window.location.pathname);
  }, [controller]);

  useEffect(() => {
    function onClick(event: MouseEvent): void {
      const target =
        event.target instanceof Element ? event.target.closest('[data-new-chat]') : null;
      if (!target) return;
      event.preventDefault();
      controller.restart();
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [controller]);

  useEffect(() => {
    const node = listRef.current;
    const last = messages.at(-1);
    if (!node || !stick.current || !last) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const streaming = status === 'streaming';
  const lastReply = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content);
  const pending = messages.find((message) => message.status === 'streaming');
  const canStop = streaming && (pending?.content.length ?? 0) > 0;

  function submit(): void {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    controller.send(text);
  }

  function clear(): void {
    if (window.confirm('清空这段对话？')) controller.clear();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section ref={panelRef} className={`chat${collapsed ? ' collapsed' : ''}`} aria-label="对话">
      {/* Announce the outcome, not every streamed character. */}
      <p className="sr-only" role="status" aria-live="polite">
        {streaming ? '小鲸正在回复' : lastReply ? `回复完成：${lastReply.content}` : ''}
      </p>
      <div className="chat-head">
        <div className="who">
          <span className="dot" data-emotion={emotion} title={EMOTION_LABEL[emotion]} />
          <span className="sr-only">情绪：{EMOTION_LABEL[emotion]}</span>
          小鲸
          <span className={mode === 'live' ? 'badge live' : 'badge'}>
            {mode === 'live' ? '实际' : '演示'}
          </span>
        </div>
        <div className="head-actions">
          <button
            className="clear"
            type="button"
            title="清空对话"
            aria-label="清空对话"
            disabled={messages.length === 0}
            onClick={clear}
          >
            清空
          </button>
          <button
            className="chev"
            type="button"
            title="收起消息区"
            aria-label="收起或展开消息区"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <svg
              className="chev-icon"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              aria-hidden="true"
            >
              <path
                d="M4 6.5 8 10.5 12 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="msgs"
        ref={listRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable log needs focus so the keyboard can scroll it
        tabIndex={0}
        role="log"
        aria-label="对话记录"
        aria-live="off"
        onScroll={(event) => {
          const node = event.currentTarget;
          stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
        }}
      >
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </div>

      <div className="quick">
        {QUICK_ACTIONS.map(([label, text]) => (
          <button
            className="chip"
            type="button"
            key={label}
            disabled={streaming}
            onClick={() => controller.quickReply(text)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="composer">
        <label className="input">
          <textarea
            value={draft}
            rows={1}
            placeholder="和它说点什么…"
            aria-label="消息"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <button
          className={canStop ? 'send stop' : 'send'}
          type="button"
          disabled={canStop ? false : streaming || draft.trim().length === 0}
          aria-label={canStop ? '停止回复' : '发送'}
          onClick={() => {
            if (canStop) controller.stop();
            else submit();
          }}
        >
          {canStop ? '■' : '↑'}
        </button>
      </div>
    </section>
  );
}
