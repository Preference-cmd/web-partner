import { cn } from 'cn';
import { CheckIcon, ChevronDownIcon, CopyIcon, FileTextIcon, ImageIcon, XIcon } from 'lucide-react';
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
  PromptInputAttachButton,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
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
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroupButton } from '@/components/ui/input-group';
import { firstSentence, showBubble } from '@/lib/character/bubble';
import { getChatController } from '@/lib/chat/controller';
import { QUICK_ACTIONS } from '@/lib/chat/demo';
import { EMOTION_LABEL } from '@/lib/chat/emotion';
import {
  ATTACHMENT_LIMIT,
  IMAGE_BYTES_MAX,
  IMAGE_MIME_TYPES,
  MAX_MESSAGE_PARTS_BYTES,
  TEXT_FILE_BYTES_MAX,
  TEXT_FILE_MIME_TYPES,
} from '@/lib/chat/llm';
import {
  applyAppearance,
  DEFAULT_SETTINGS,
  EFFORT_LABEL,
  EFFORT_ORDER,
  type Effort,
  loadSettings,
  readApiKey,
  resolveMode,
  type Settings,
  saveSettings,
} from '@/lib/chat/settings';
import type {
  Message as ChatMessage,
  ChatMode,
  Emotion,
  MessageAttachment,
} from '@/lib/chat/types';
import { announceSettings, requestSettings, SETTINGS_CHANGED_EVENT } from '@/lib/ui/open-settings';

/** How much of the figure must stay above the panel before growth stops. */
const TARGET_VISIBLE = { narrow: 0.6, wide: 0.56 };
/** The stage can rise this far before it would leave the top of the screen. */
const LIFT_CAP = 250;
/** Below this the panel stops being a conversation. */
const MIN_PANEL = 220;
const PANEL_GAP = { narrow: 12, wide: 24 };

function maxPanelHeight(): number {
  return Math.min(window.innerHeight * 0.72, 720);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function resolveMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'md') return 'text/markdown';
  if (ext === 'json') return 'application/json';
  if (ext === 'csv') return 'text/csv';
  return 'text/plain';
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

/** The composer asks the question the mood asks. */
const PLACEHOLDER: Record<Emotion, string> = {
  idle: '和她说点什么…',
  happy: '她正开心，说点什么？',
  shy: '她有点害羞…',
  sleepy: '她困了，轻声说…',
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
      {message.attachments?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {message.attachments.map((file) => (
            <span
              key={file.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
              title={file.dataUrl ? file.name : '附件已过期，重新添加'}
            >
              {file.mime.startsWith('image/') ? (
                <ImageIcon className="size-3.5 shrink-0" />
              ) : (
                <FileTextIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{file.name}</span>
              {file.dataUrl ? null : <span className="shrink-0">已过期</span>}
            </span>
          ))}
        </div>
      ) : null}
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [maxHeight, setMaxHeight] = useState(720);
  // The on-screen keyboard shrinks the visual viewport, not the layout one.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [viewportCap, setViewportCap] = useState(720);
  const panelRef = useRef<HTMLElement>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  // The sync callback is created once; it reads the pinned height through this ref.
  const heightRef = useRef<number | null>(null);
  const collapsedRef = useRef(false);

  // The visual viewport shrinks when a keyboard opens; the layout one does not.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = (): void => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset > 90 ? Math.round(inset) : 0);
      setViewportCap(Math.round(viewport.height));
      syncRef.current?.();
    };
    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
    };
  }, []);

  useEffect(() => {
    controller.hydrate();
  }, [controller]);

  useEffect(() => {
    document.documentElement.dataset.emotion = emotion;
  }, [emotion]);

  // The stage button is outside this island; it asks for a head pat through an event.
  useEffect(() => {
    const onTouch = (): void => controller.quickReply('摸摸头');
    window.addEventListener('partner:touch', onTouch);
    return () => window.removeEventListener('partner:touch', onTouch);
  }, [controller]);

  // The reply's first sentence also lands on the stage, once per reply.
  const echoedRef = useRef<string | null>(null);
  useEffect(() => {
    const last = [...messages]
      .reverse()
      .find((item) => item.role === 'assistant' && item.status === 'done');
    if (!last) return;
    if (echoedRef.current === null) {
      // History was already there; only a new reply may speak.
      echoedRef.current = last.id;
      return;
    }
    if (echoedRef.current === last.id) return;
    echoedRef.current = last.id;
    if (!settings.echo) return;
    const line = firstSentence(last.content);
    if (line) showBubble(line);
  }, [messages, settings.echo]);

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    applyAppearance(document.documentElement, stored);
    setSettings(stored);
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

  // The settings dialog writes on every change; the composer shows the same values.
  useEffect(() => {
    const read = (): void => {
      const next = loadSettings(window.localStorage);
      setSettings(next);
      setMode(resolveMode(next, readApiKey(window.sessionStorage, window.localStorage)));
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, read);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, read);
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
      // Collapsing drops the pin so the panel can shrink to its header; expanding restores it.
      const pinned = collapsedRef.current ? null : heightRef.current;
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
    collapsedRef.current = collapsed;
    syncRef.current?.();
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

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((item) => item.id !== id));
    setAttachmentError(null);
  }

  function addFiles(files: FileList | File[]): void {
    const list = Array.from(files);
    if (list.length === 0) return;
    setAttachmentError(null);
    const room = ATTACHMENT_LIMIT - attachments.length;
    if (room <= 0) {
      setAttachmentError(`每条消息最多 ${ATTACHMENT_LIMIT} 个附件`);
      return;
    }
    if (list.length > room) {
      setAttachmentError(`每条消息最多 ${ATTACHMENT_LIMIT} 个附件，已收下前 ${room} 个`);
    }
    let total = attachments.reduce((sum, item) => sum + item.size, 0);
    for (const file of list.slice(0, room)) {
      const mime = resolveMime(file);
      const image = (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
      const text = (TEXT_FILE_MIME_TYPES as readonly string[]).includes(mime);
      if (!image && !text) {
        setAttachmentError('只支持图片和纯文本文件（txt / md / json / csv）');
        continue;
      }
      const max = image ? IMAGE_BYTES_MAX : TEXT_FILE_BYTES_MAX;
      if (file.size > max) {
        setAttachmentError(
          `「${file.name}」有 ${formatBytes(file.size)}，${image ? '单张图片' : '单个文本'}最大 ${formatBytes(max)}`,
        );
        continue;
      }
      if (total + file.size > MAX_MESSAGE_PARTS_BYTES) {
        setAttachmentError(`附件合计不能超过 ${formatBytes(MAX_MESSAGE_PARTS_BYTES)}`);
        continue;
      }
      total += file.size;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          setAttachmentError(`「${file.name}」读取失败`);
          return;
        }
        setAttachments((current) =>
          current.length >= ATTACHMENT_LIMIT
            ? current
            : [
                ...current,
                {
                  id: `a-${Date.now().toString(36)}-${current.length}`,
                  name: file.name,
                  mime,
                  size: file.size,
                  dataUrl: result,
                },
              ],
        );
      };
      reader.onerror = () => setAttachmentError(`「${file.name}」读取失败`);
      reader.readAsDataURL(file);
    }
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

  function pickModel(model: string): void {
    const next = { ...settings, model };
    setSettings(next);
    saveSettings(window.localStorage, next);
    announceSettings();
  }

  function pickEffort(effort: Effort): void {
    const next = { ...settings, effort };
    setSettings(next);
    saveSettings(window.localStorage, next);
    announceSettings();
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

  const modelLabel = settings.model.trim() || '未设模型';
  const effortLabel = EFFORT_LABEL[settings.effort];

  const modelItems =
    settings.modelPresets.length === 0 ? (
      <DropdownMenuItem disabled>还没有保存的模型</DropdownMenuItem>
    ) : (
      <DropdownMenuRadioGroup value={settings.model} onValueChange={pickModel}>
        {settings.modelPresets.map((preset) => (
          <DropdownMenuRadioItem key={preset.id} value={preset.model}>
            {preset.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    );

  const effortItems = (
    <DropdownMenuRadioGroup
      value={settings.effort}
      onValueChange={(value) => pickEffort(value as Effort)}
    >
      {EFFORT_ORDER.map((id) => (
        <DropdownMenuRadioItem key={id} value={id}>
          {EFFORT_LABEL[id]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  return (
    <section
      ref={panelRef}
      aria-label="对话"
      style={{
        backgroundColor:
          'color-mix(in oklab, var(--card) calc(var(--panel-alpha, 0.62) * 100%), transparent)',
        // A notch and a keyboard both eat into the bottom edge.
        bottom: `calc(max(${PANEL_GAP[narrow ? 'narrow' : 'wide']}px, env(safe-area-inset-bottom)) + ${keyboardInset}px)`,
        maxHeight: `${Math.max(MIN_PANEL, Math.min(narrow ? 520 : 720, viewportCap - 2 * PANEL_GAP[narrow ? 'narrow' : 'wide']))}px`,
        ...(narrow || collapsed || manualHeight === null ? {} : { height: `${manualHeight}px` }),
      }}
      className="absolute left-1/2 z-20 flex w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border text-card-foreground shadow-2xl backdrop-blur-xl md:w-[min(760px,calc(100%-3rem))]"
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
                className="text-muted-foreground max-md:h-11"
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
            className="max-md:size-11"
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

      {/* Folded or not, the quick actions stay one tap away. */}
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

      <PromptInput
        className="border-t p-2"
        onSubmit={({ text }) => {
          const value = text.trim();
          setDraft('');
          if (value || attachments.length > 0) controller.send(value, attachments);
          setAttachments([]);
          setAttachmentError(null);
        }}
      >
        {attachments.length > 0 ? (
          <PromptInputHeader>
            {attachments.map((file) => (
              <Attachment key={file.id} size="sm">
                <AttachmentMedia>
                  {file.mime.startsWith('image/') ? <ImageIcon /> : <FileTextIcon />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`移除 ${file.name}`}
                    onClick={() => removeAttachment(file.id)}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </PromptInputHeader>
        ) : null}
        {attachmentError ? (
          <p className="px-3 pt-2 text-xs text-destructive" role="alert">
            {attachmentError}
          </p>
        ) : null}
        <PromptInputBody>
          <PromptInputTextarea
            className="max-h-32 min-h-9 text-sm"
            placeholder={PLACEHOLDER[emotion]}
            aria-label="消息"
            aria-keyshortcuts="Meta+K Control+K /"
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length === 0) return;
              event.preventDefault();
              addFiles(files);
            }}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputAttachButton
              className="max-md:size-11"
              onClick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv"
              className="sr-only"
              multiple
              tabIndex={-1}
              type="file"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </PromptInputTools>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {narrow ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <InputGroupButton
                    size="sm"
                    variant="outline"
                    className="max-w-32 rounded-full"
                    aria-label={`模型与努力：${modelLabel}，${effortLabel}`}
                  >
                    <span className="truncate">{modelLabel}</span>
                    <ChevronDownIcon className="size-3.5 opacity-60" />
                  </InputGroupButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>模型</DropdownMenuLabel>
                  {modelItems}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>努力</DropdownMenuLabel>
                  {effortItems}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => requestSettings()}>管理模型…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <InputGroupButton
                      size="sm"
                      variant="outline"
                      className="max-w-36 rounded-full"
                      aria-label={`模型：${modelLabel}`}
                    >
                      <span className="truncate">{modelLabel}</span>
                      <ChevronDownIcon className="size-3.5 opacity-60" />
                    </InputGroupButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>模型</DropdownMenuLabel>
                    {modelItems}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => requestSettings()}>
                      管理模型…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <InputGroupButton
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      aria-label={`努力：${effortLabel}`}
                    >
                      <span className="text-muted-foreground">努力</span>
                      {effortLabel}
                      <ChevronDownIcon className="size-3.5 opacity-60" />
                    </InputGroupButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>努力</DropdownMenuLabel>
                    {effortItems}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <PromptInputSubmit
              className="max-md:size-11"
              status={streaming ? 'streaming' : 'ready'}
              disabled={!streaming && draft.trim().length === 0 && attachments.length === 0}
              onClick={(event) => {
                if (!streaming) return;
                event.preventDefault();
                controller.stop();
              }}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </section>
  );
}
