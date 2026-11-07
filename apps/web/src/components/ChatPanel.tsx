import { cn } from 'cn';
import { ArrowUpIcon, ChevronDownIcon, SquareIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getChatController } from '@/lib/chat/controller';
import { QUICK_ACTIONS } from '@/lib/chat/demo';
import { applyAppearance, loadSettings, readApiKey, resolveMode } from '@/lib/chat/settings';
import type { ChatMode, Emotion, Message, MessageSource } from '@/lib/chat/types';

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

const EMOTION_DOT: Record<Emotion, string> = {
  idle: 'bg-muted-foreground',
  happy: 'bg-amber-400',
  shy: 'bg-pink-400',
  sleepy: 'bg-slate-400',
};

function Typing() {
  return (
    <span className="inline-flex gap-1 py-0.5" aria-hidden>
      {[0, 1, 2].map((index) => (
        <i
          key={index}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}

function MessageRow({ message }: { message: Message }) {
  const mine = message.role === 'user';
  const waiting = !mine && message.status === 'streaming' && message.content.length === 0;
  // An interrupted reply with no text is news, not a bubble.
  const interrupted = !mine && message.status === 'aborted' && message.content.length === 0;
  return (
    <div
      className={cn('flex max-w-[85%] flex-col gap-1', mine ? 'items-end self-end' : 'items-start')}
    >
      <span className="text-[10px] text-muted-foreground">
        {mine ? '你' : SOURCE_LABEL[message.source ?? 'demo']}
        {message.status === 'aborted' ? ' · 已中断' : ''}
      </span>
      {interrupted ? null : (
        <div
          className={cn(
            'rounded-2xl px-3 py-2 break-words whitespace-pre-wrap',
            mine
              ? 'rounded-br-sm bg-primary text-primary-foreground'
              : 'rounded-bl-sm bg-muted text-foreground',
          )}
        >
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

  // "新对话" is a link: intercepted here, or honoured after landing on /?new=1.
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
    controller.clear();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section
      ref={panelRef}
      aria-label="对话"
      style={{
        backgroundColor:
          'color-mix(in oklab, var(--card) calc(var(--panel-alpha, 0.62) * 100%), transparent)',
      }}
      className="absolute bottom-3 left-1/2 z-20 flex max-h-[min(52vh,520px)] w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border text-card-foreground shadow-2xl backdrop-blur-xl md:bottom-6 md:max-h-[min(62vh,640px)] md:w-[min(760px,calc(100%-3rem))]"
    >
      {/* Announce the outcome, not every streamed character. */}
      <p className="sr-only" role="status" aria-live="polite">
        {streaming ? '小鲸正在回复' : lastReply ? `回复完成：${lastReply.content}` : ''}
      </p>

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', EMOTION_DOT[emotion])} aria-hidden />
          <span className="sr-only">情绪：{EMOTION_LABEL[emotion]}</span>
          <span className="text-sm font-medium">小鲸</span>
          <Badge variant={mode === 'live' ? 'default' : 'secondary'} className="text-[10px]">
            {mode === 'live' ? '实际' : '演示'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={messages.length === 0}
              >
                清空
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清空这段对话？</AlertDialogTitle>
                <AlertDialogDescription>
                  清空后不能恢复，本机保存的历史也会一起删掉。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={clear}>
                  清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? '展开消息区' : '收起消息区'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDownIcon className={cn('transition-transform', collapsed && '-rotate-90')} />
          </Button>
        </div>
      </div>

      {collapsed ? null : (
        <div
          ref={listRef}
          role="log"
          aria-label="对话记录"
          aria-live="off"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable log needs focus so the keyboard can scroll it
          tabIndex={0}
          onScroll={(event) => {
            const node = event.currentTarget;
            stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
          }}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {messages.length === 0 ? (
            <p className="text-muted-foreground">还没有对话。说点什么，或者点下面的快捷按钮。</p>
          ) : (
            messages.map((message) => <MessageRow key={message.id} message={message} />)
          )}
        </div>
      )}

      {collapsed ? null : (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {QUICK_ACTIONS.map(([label, text]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              disabled={streaming}
              onClick={() => controller.quickReply(text)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t px-3 py-2.5">
        <Textarea
          value={draft}
          rows={1}
          placeholder="和它说点什么…"
          aria-label="消息"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="field-sizing-content max-h-24 min-h-9 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          size="icon"
          variant={canStop ? 'destructive' : 'default'}
          disabled={canStop ? false : streaming || draft.trim().length === 0}
          aria-label={canStop ? '停止回复' : '发送'}
          onClick={() => {
            if (canStop) controller.stop();
            else submit();
          }}
        >
          {canStop ? <SquareIcon className="size-3.5 fill-current" /> : <ArrowUpIcon />}
        </Button>
      </div>
    </section>
  );
}
