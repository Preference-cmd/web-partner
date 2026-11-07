import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { getChatController } from '../lib/chat/controller';
import { QUICK_ACTIONS } from '../lib/chat/demo';
import { applyAppearance, loadSettings } from '../lib/chat/settings';
import type { Message, MessageSource } from '../lib/chat/types';

const SOURCE_LABEL: Record<MessageSource, string> = {
  demo: '演示',
  model: '模型',
  fallback: '回落',
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
  return (
    <div className={`msg ${mine ? 'me' : 'bot'}`}>
      <div className="name">
        {mine ? '你' : `小鲸 · ${SOURCE_LABEL[message.source ?? 'demo']}`}
        {message.status === 'aborted' ? <span className="note">已中断</span> : null}
      </div>
      <div className="bubble">
        {message.content}
        {waiting ? <Typing /> : null}
      </div>
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
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    controller.hydrate();
  }, [controller]);

  useEffect(() => {
    document.documentElement.dataset.emotion = emotion;
  }, [emotion]);

  useEffect(() => {
    applyAppearance(document.documentElement, loadSettings(window.localStorage));
  }, []);

  useEffect(() => {
    const node = listRef.current;
    const last = messages.at(-1);
    if (!node || !stick.current || !last) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const streaming = status === 'streaming';
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
    <section className={`chat${collapsed ? ' collapsed' : ''}`} aria-label="对话">
      <div className="chat-head">
        <div className="who">
          <span className="dot" data-emotion={emotion} />
          小鲸 · 在线
        </div>
        <div className="head-actions">
          <button className="clear" type="button" title="清空对话" onClick={clear}>
            清空
          </button>
          <button
            className="chev"
            type="button"
            title="收起消息区"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      <div
        className="msgs"
        ref={listRef}
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
        <div className="attach" aria-hidden="true">
          ＋
        </div>
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
