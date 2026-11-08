import { cn } from 'cn';
import { CheckIcon, ChevronDownIcon, CopyIcon } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
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
import { EMOTION_LABEL } from '@/lib/chat/emotion';
import {
  applyAppearance,
  loadSettings,
  readApiKey,
  resolveMode,
  saveSettings,
} from '@/lib/chat/settings';
import type { Message as ChatMessage, ChatMode, Emotion } from '@/lib/chat/types';

/** How much of the figure must stay above the panel before growth stops. */
const TARGET_VISIBLE = { narrow: 0.6, wide: 0.55 };
/** The stage can rise this far before it would leave the top of the screen. */
const LIFT_CAP = 250;
/** Below this the panel stops being a conversation. */
const MIN_PANEL = 220;
const PANEL_GAP = { narrow: 12, wide: 24 };

function maxPanelHeight(): number {
  return Math.min(window.innerHeight * 0.72, 720);
}

function clampPanelHeight(value: number): number {
  return Math.round(Math.min(maxPanelHeight(), Math.max(MIN_PANEL, value)));
}

const EMOTION_DOT: Record<Emotion, string> = {
  idle: 'bg-muted-foreground',
  happy: 'bg-amber-400',
  shy: 'bg-pink-400',
  sleepy: 'bg-slate-400',
};

function MessageRow({ message, index }: { message: ChatMessage; index: number }) {
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
    <Message className={cn('relative', !mine && 'pr-9')} from={mine ? 'user' : 'assistant'}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{mine ? '你' : '小鲸'}</span>
        {!mine && message.source === 'fallback' ? (
          <span className="rounded border px-1 text-xs" title="模型没有响应，这一条由本地模板生成">
            模板回复
          </span>
        ) : null}
        {message.status === 'aborted' ? <span>· 已中断</span> : null}
      </div>
      {interrupted ? null : (
        <MessageContent className="whitespace-pre-wrap">
          {message.content}
          {waiting ? <Loader className="text-muted-foreground" size={14} /> : null}
        </MessageContent>
      )}
      {!mine && message.content.length > 0 && !waiting ? (
        <MessageActions className="absolute top-0 right-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <MessageAction
            label={`复制第 ${index + 1} 条回复`}
            tooltip={copied ? '已复制' : '复制回复'}
            onClick={copy}
          >
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
  const [mode, setMode] = useState<ChatMode>('demo');
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [maxHeight, setMaxHeight] = useState(720);
  const panelRef = useRef<HTMLElement>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  // The sync callback is created once; it reads the pinned height through this ref.
  const heightRef = useRef<number | null>(null);

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
    if (stored.panelHeight !== null) setManualHeight(clampPanelHeight(stored.panelHeight));

    // Resizing the window changes both the phone breakpoint and the tallest the panel may be.
    const media = window.matchMedia('(max-width: 767px)');
    const update = (): void => {
      setNarrow(media.matches);
      setMaxHeight(maxPanelHeight());
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // A pinned height overrides the content-sized panel; sync() reads it through the ref.
  useEffect(() => {
    heightRef.current = narrow ? null : manualHeight;
    syncRef.current?.();
  }, [manualHeight, narrow]);

  // The list is sized by content until it would pass the panel cap. It needs an explicit
  // height, not a max: stick-to-bottom's scroll area is height:100%, which only scrolls
  // against a definite parent. The panel stays content-sized and the stage rides --panel-lift.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const root = document.documentElement;
    const sync = (): void => {
      const narrow = window.innerWidth < 768;
      const viewport = root.clientHeight;
      const gap = narrow ? PANEL_GAP.narrow : PANEL_GAP.wide;
      const visibleRatio = narrow ? TARGET_VISIBLE.narrow : TARGET_VISIBLE.wide;
      const stage = document.querySelector<HTMLElement>('[data-character-stage]');
      const stageHeight = stage?.offsetHeight ?? 0;
      // A taller panel only stays clear of the figure while the stage can give back the
      // difference. Past this height the panel starts covering the face, so the content
      // stops growing and scrolls instead.
      // Never lift the figure past the top edge: 14% floor + figure height + lift must fit.
      const liftCap =
        stageHeight > 0 ? Math.min(LIFT_CAP, Math.max(0, viewport * 0.86 - stageHeight)) : 0;
      const keepVisible =
        stageHeight > 0
          ? liftCap + viewport * 0.14 + stageHeight * (1 - visibleRatio) - gap
          : Number.POSITIVE_INFINITY;
      const cap = Math.min(
        viewport * (narrow ? 0.52 : 0.72),
        narrow ? 520 : 720,
        Math.max(MIN_PANEL, keepVisible),
      );
      const pinned = heightRef.current;
      const conversation = node.querySelector<HTMLElement>('[aria-label="对话记录"]');
      const content = conversation?.firstElementChild?.firstElementChild as HTMLElement | null;
      if (conversation && pinned !== null) {
        // A pinned panel owns its height; the list simply fills what is left.
        if (conversation.style.flex !== '1 1 auto') conversation.style.flex = '1 1 auto';
        if (conversation.style.height !== '') conversation.style.height = '';
      } else if (conversation && content) {
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
      // Solve for the lift that keeps `target` of the figure above the panel top.
      const lift =
        stageHeight > 0
          ? Math.max(
              0,
              Math.min(liftCap, height + gap - viewport * 0.14 - stageHeight * (1 - visibleRatio)),
            )
          : 0;
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

  // Arriving from another page with ?new=1: a new conversation is not destructive any more,
  // so the query only has to start one and disappear.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    window.history.replaceState(null, '', window.location.pathname);
    controller.newSession();
  }, [controller]);

  // Reaching the composer should not cost fifteen tabs.
  useEffect(() => {
    function focusComposer(): void {
      panelRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusComposer();
        return;
      }
      if (!typing && event.key === '/') {
        event.preventDefault();
        focusComposer();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const streaming = status === 'streaming';
  const last = messages[messages.length - 1];
  const aborted = last?.role === 'assistant' && last.status === 'aborted';
  const lastReply = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content);

  function clear(): void {
    controller.clear();
  }

  function persistHeight(value: number | null): void {
    const stored = loadSettings(window.localStorage);
    saveSettings(window.localStorage, { ...stored, panelHeight: value });
  }

  /** Pin the panel to a height, or pass null to go back to content-sized. */
  function applyHeight(value: number | null): void {
    const next = value === null || narrow ? null : clampPanelHeight(value);
    setManualHeight(next);
    heightRef.current = next;
    persistHeight(next);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: panelRef.current.offsetHeight };
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampPanelHeight(drag.startHeight + (drag.startY - event.clientY));
    setManualHeight(next);
    heightRef.current = next;
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Commit once, not on every pointer move.
    persistHeight(heightRef.current);
  }

  function onHandleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const node = panelRef.current;
    if (!node) return;
    const base = heightRef.current ?? node.offsetHeight;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      applyHeight(base + (event.key === 'ArrowUp' ? 24 : -24));
    } else if (event.key === 'Home') {
      event.preventDefault();
      applyHeight(MIN_PANEL);
    } else if (event.key === 'End') {
      event.preventDefault();
      applyHeight(maxPanelHeight());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      applyHeight(null);
    }
  }

  return (
    <section
      ref={panelRef}
      aria-label="对话"
      style={{
        backgroundColor:
          'color-mix(in oklab, var(--card) calc(var(--panel-alpha, 0.62) * 100%), transparent)',
        ...(narrow || manualHeight === null ? {} : { height: `${manualHeight}px` }),
      }}
      className="absolute bottom-3 left-1/2 z-20 flex max-h-[min(52vh,520px)] w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border text-card-foreground shadow-2xl backdrop-blur-xl md:bottom-6 md:max-h-[min(72vh,720px)] md:w-[min(760px,calc(100%-3rem))]"
    >
      {narrow || collapsed ? null : (
        // biome-ignore lint/a11y/useSemanticElements: the handle needs pointer capture and a grip child; an hr cannot hold either.
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整对话高度"
          aria-valuemin={MIN_PANEL}
          aria-valuemax={maxHeight}
          aria-valuenow={manualHeight ?? undefined}
          tabIndex={0}
          className="group absolute inset-x-0 top-0 z-10 hidden h-3 cursor-ns-resize touch-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:block"
          onDoubleClick={() => applyHeight(null)}
          onKeyDown={onHandleKeyDown}
          onPointerCancel={endResize}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
        >
          <span className="absolute top-1 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>
      )}

      {/* Announce the outcome, not every streamed character. */}
      <p className="sr-only" role="status" aria-live="polite">
        {streaming
          ? '小鲸正在回复'
          : aborted
            ? '回复已中断'
            : lastReply
              ? `回复完成：${lastReply.content}`
              : ''}
      </p>

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', EMOTION_DOT[emotion])} aria-hidden />
          <span className="text-sm font-medium">小鲸</span>
          <span className="text-xs text-muted-foreground">{EMOTION_LABEL[emotion]}</span>
          <Badge variant={mode === 'live' ? 'default' : 'secondary'} className="text-xs">
            {mode === 'live' ? '实时' : '演示'}
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
            messages.map((message, index) => (
              <MessageRow key={message.id} message={message} index={index} />
            ))
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
            aria-keyshortcuts="Meta+K Control+K /"
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
