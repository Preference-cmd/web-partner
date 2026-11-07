import { cn } from 'cn';
import { CheckIcon, ChevronDownIcon, CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
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
import { getChatController } from '@/lib/chat/controller';
import { QUICK_ACTIONS } from '@/lib/chat/demo';
import { applyAppearance, loadSettings, readApiKey, resolveMode } from '@/lib/chat/settings';
import type { Message as ChatMessage, ChatMode, Emotion, MessageSource } from '@/lib/chat/types';

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

function MessageRow({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  const waiting = !mine && message.status === 'streaming' && message.content.length === 0;
  // An interrupted reply with no text is news, not a bubble.
  const interrupted = !mine && message.status === 'aborted' && message.content.length === 0;
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission can be denied; the reply is still on screen.
    }
  }

  return (
    <Message from={mine ? 'user' : 'assistant'}>
      <div className="text-[10px] text-muted-foreground">
        {mine ? '你' : SOURCE_LABEL[message.source ?? 'demo']}
        {message.status === 'aborted' ? ' · 已中断' : ''}
      </div>
      {interrupted ? null : (
        <MessageContent className="whitespace-pre-wrap">
          {message.content}
          {waiting ? <Loader className="text-muted-foreground" size={14} /> : null}
        </MessageContent>
      )}
      {!mine && message.content.length > 0 && !waiting ? (
        <MessageActions>
          <MessageAction tooltip={copied ? '已复制' : '复制回复'} onClick={copy}>
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </MessageAction>
        </MessageActions>
      ) : null}
    </Message>
  );
}

export default function ChatPanel() {
  const controller = getChatController();
  const messages = useStore(controller.store, (state) => state.messages);
  const status = useStore(controller.store, (state) => state.status);
  const emotion = useStore(controller.store, (state) => state.emotion);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [mode, setMode] = useState<ChatMode>('demo');
  const panelRef = useRef<HTMLElement>(null);
  const syncRef = useRef<(() => void) | null>(null);

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

  // The list is sized by content until it would pass the panel cap. It needs an explicit
  // height, not a max: stick-to-bottom's scroll area is height:100%, which only scrolls
  // against a definite parent. The panel stays content-sized and the stage rides --panel-lift.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const root = document.documentElement;
    const sync = (): void => {
      const narrow = window.innerWidth < 768;
      const cap = Math.min(root.clientHeight * (narrow ? 0.52 : 0.62), narrow ? 520 : 640);
      const conversation = node.querySelector<HTMLElement>('[aria-label="对话记录"]');
      const content = conversation?.firstElementChild?.firstElementChild as HTMLElement | null;
      if (conversation && content) {
        let others = 2; // the panel's top and bottom border
        for (const child of node.children) {
          if (child !== conversation) others += (child as HTMLElement).offsetHeight;
        }
        const available = Math.max(96, cap - others);
        // The list must not flex: a grown flex item leaves the height:100% scroll area inside
        // it resolving against content, so the conversation never scrolls. Compare inline
        // values, not offsetHeight, which flex has already squeezed down to the cap.
        if (conversation.style.flex !== '0 0 auto') conversation.style.flex = '0 0 auto';
        const target = `${Math.round(Math.max(0, Math.min(content.scrollHeight, available)))}px`;
        if (conversation.style.height !== target) conversation.style.height = target;
      }
      const height = node.offsetHeight;
      const lift = Math.max(0, Math.min(150, height - root.clientHeight * 0.46));
      root.style.setProperty('--panel-h', `${height}px`);
      root.style.setProperty('--panel-lift', `${Math.round(lift)}px`);
    };
    syncRef.current = sync;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    // Capped at its cap, the panel keeps its size, so content growth shows on the list only.
    const inner =
      node.querySelector<HTMLElement>('[aria-label="对话记录"]')?.firstElementChild
        ?.firstElementChild;
    if (inner) observer.observe(inner);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      syncRef.current = null;
    };
  }, []);

  // Collapsing hides the list (display:none), which is not a resize the observer can see.
  useEffect(() => {
    if (!collapsed) syncRef.current?.();
  }, [collapsed]);

  // The sidebar owns the button; this island owns the store, so the guard lives here.
  useEffect(() => {
    function onClick(event: MouseEvent): void {
      const target =
        event.target instanceof Element ? event.target.closest('[data-new-chat]') : null;
      if (!target) return;
      event.preventDefault();
      const hasUserMessage = controller.store
        .getState()
        .messages.some((message) => message.role === 'user');
      if (hasUserMessage) setConfirmNew(true);
      else controller.restart();
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [controller]);

  const streaming = status === 'streaming';
  const lastReply = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content);

  function clear(): void {
    controller.clear();
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

      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>开始新对话？</AlertDialogTitle>
            <AlertDialogDescription>现在这段对话会被清掉，清掉就回不来了。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => controller.restart()}>新对话</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kept mounted while collapsed: the resize observer below holds its node. */}
      <Conversation
        className={cn('min-h-0', collapsed && 'hidden')}
        aria-label="对话记录"
        aria-live="off"
        tabIndex={0}
      >
        <ConversationContent className="gap-4 px-4 py-3">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="还没有对话"
              description="说点什么，或者点下面的快捷按钮。"
              className="p-2"
            />
          ) : (
            messages.map((message) => <MessageRow key={message.id} message={message} />)
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="跳到最新消息" />
      </Conversation>

      {collapsed ? null : (
        <div className="px-3 pb-1">
          <Suggestions>
            {QUICK_ACTIONS.map(([label, text]) => (
              <Suggestion
                key={label}
                suggestion={text}
                onClick={(value) => controller.quickReply(value)}
                disabled={streaming}
              >
                {label}
              </Suggestion>
            ))}
          </Suggestions>
        </div>
      )}

      <PromptInput
        className="border-t p-2"
        onSubmit={({ text }) => {
          const value = text.trim();
          setDraft('');
          if (value) controller.send(value);
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            className="max-h-32 min-h-9 text-sm"
            placeholder="和它说点什么…"
            aria-label="消息"
            onChange={(event) => setDraft(event.target.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            status={streaming ? 'streaming' : 'ready'}
            aria-label={streaming ? '停止回复' : '发送'}
            disabled={!streaming && draft.trim().length === 0}
            onClick={(event) => {
              if (!streaming) return;
              event.preventDefault();
              controller.stop();
            }}
          />
        </PromptInputFooter>
      </PromptInput>
    </section>
  );
}
