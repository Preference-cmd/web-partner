import { cn } from 'cn';
import { PanelRightIcon, Trash2Icon, XIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showBubble } from '@/lib/character/bubble';
import type { RendererKind } from '@/lib/character/renderer';
import { getChatController } from '@/lib/chat/controller';
import { EMOTION_LABEL } from '@/lib/chat/emotion';
import {
  applyModeChip,
  currentApiKey,
  DEFAULT_SETTINGS,
  describeMode,
  loadSettings,
  resolveMode,
  type Settings,
  saveSettings,
} from '@/lib/chat/settings';
import type { Emotion } from '@/lib/chat/types';
import { clearLog, LOG_LIMIT, type LogSource, logStore, pushLog } from '@/lib/debug/log';
import {
  applyPanelPrefs,
  DEFAULT_PANEL_PREFS,
  LIGHT_EVENT,
  LIGHT_THEMES,
  type LightTheme,
  loadPanelPrefs,
  type PanelPrefs,
  savePanelPrefs,
  setLight,
} from '@/lib/debug/prefs';
import { requestSettings } from '@/lib/ui/open-settings';
import { useMediaQuery } from '@/lib/ui/use-media-query';

const EMOTIONS: ReadonlyArray<Emotion> = ['idle', 'happy', 'shy', 'sleepy'];

const RENDERERS: ReadonlyArray<{ id: RendererKind; label: string; hint: string }> = [
  { id: 'canvas2d', label: '动画', hint: '帧序列循环、一次性动作与交叉淡化' },
  { id: 'static', label: '静帧', hint: '每个状态只画一帧，不跑动画循环' },
];

type ModeChoice = 'demo' | 'live' | 'forceDemo';

const MODES: ReadonlyArray<{ id: ModeChoice; label: string }> = [
  { id: 'demo', label: '演示' },
  { id: 'live', label: '实时' },
  { id: 'forceDemo', label: '强制演示' },
];

const SOURCE: Record<LogSource, { label: string; dot: string }> = {
  user: { label: '用户', dot: 'bg-sky-400' },
  quick: { label: '快捷', dot: 'bg-emerald-400' },
  debug: { label: '调试', dot: 'bg-violet-400' },
  system: { label: '系统', dot: 'bg-slate-400' },
  demo: { label: '演示', dot: 'bg-amber-400' },
  model: { label: '模型', dot: 'bg-blue-400' },
  fallback: { label: '回落', dot: 'bg-rose-400' },
};

interface Snapshot {
  stage: string;
  pose: string;
  renderer: string;
  fps: string;
  dpr: string;
  context2d: boolean;
  reduced: boolean;
}

const EMPTY_SNAPSHOT: Snapshot = {
  stage: '—',
  pose: '—',
  renderer: '—',
  fps: '—',
  dpr: '—',
  context2d: false,
  reduced: false,
};

let context2d: boolean | null = null;

function supports2d(): boolean {
  context2d ??= document.createElement('canvas').getContext('2d') !== null;
  return context2d;
}

function readSnapshot(reduced: boolean): Snapshot {
  const stage = document.querySelector<HTMLElement>('[data-character-stage]');
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return {
    stage: stage?.dataset.characterState ?? '—',
    pose: stage?.dataset.pose ?? '—',
    renderer: stage?.dataset.renderer ?? '—',
    fps: stage?.dataset.fps ?? '—',
    dpr: `${dpr}×`,
    context2d: supports2d(),
    reduced,
  };
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-2 py-3">
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-3 pb-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-xs">{description}</CardDescription>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-3">{children}</CardContent>
    </Card>
  );
}

export default function DebugPanel() {
  const controller = getChatController();
  const emotion = useStore(controller.store, (state) => state.emotion);
  const chatStatus = useStore(controller.store, (state) => state.status);
  const entries = useStore(logStore, (state) => state.entries);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [prefs, setPrefs] = useState<PanelPrefs>(DEFAULT_PANEL_PREFS);
  const prefsRef = useRef<PanelPrefs>(DEFAULT_PANEL_PREFS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [reduced, setReduced] = useState(false);
  const [bubble, setBubble] = useState('');

  useEffect(() => {
    const stored = loadPanelPrefs(window.localStorage);
    prefsRef.current = stored;
    setPrefs(stored);
    applyPanelPrefs(document.documentElement, stored);
    const saved = loadSettings(window.localStorage);
    setSettings(saved);
    setApiKey(currentApiKey(saved, window.sessionStorage, window.localStorage));
  }, []);

  // The settings page owns the other light switch; follow it instead of copying it.
  useEffect(() => {
    const sync = (event: Event): void => {
      const next = (event as CustomEvent<{ light?: LightTheme }>).detail?.light;
      if (!next) return;
      prefsRef.current = { ...prefsRef.current, light: next };
      setPrefs((current) => ({ ...current, light: next }));
    };
    window.addEventListener(LIGHT_EVENT, sync);
    return () => window.removeEventListener(LIGHT_EVENT, sync);
  }, []);

  // The preference can arrive from the media query or from the settings page.
  useEffect(() => {
    const list = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => {
      setReduced(list.matches || document.documentElement.dataset.motion === 'reduced');
    };
    update();
    list.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    return () => {
      list.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  // The panel samples the stage once a second; the renderer stays the source.
  useEffect(() => {
    const tick = (): void => setSnapshot(readSnapshot(reduced));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [reduced]);

  const updatePrefs = useCallback((patch: Partial<PanelPrefs>): PanelPrefs => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    savePanelPrefs(window.localStorage, next);
    return next;
  }, []);

  const open = prefs.open;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') updatePrefs({ open: false });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, updatePrefs]);

  function chooseEmotion(next: string): void {
    if (next === 'idle' || next === 'happy' || next === 'shy' || next === 'sleepy') {
      controller.forceEmotion(next);
    }
  }

  function chooseLight(next: string): void {
    const light = LIGHT_THEMES.find((item) => item.id === next);
    if (!light) return;
    setLight(window.localStorage, light.id);
    updatePrefs({ light: light.id });
    pushLog('debug', `灯光切到${light.label}`);
  }

  function chooseRenderer(next: string): void {
    const renderer = RENDERERS.find((item) => item.id === next);
    if (!renderer) return;
    updatePrefs({ renderer: renderer.id });
    window.dispatchEvent(
      new CustomEvent('partner:renderer', { detail: { renderer: renderer.id } }),
    );
    pushLog('debug', `渲染器切到${renderer.label}`);
  }

  function chooseMode(next: string): void {
    const mode = MODES.find((item) => item.id === next);
    if (!mode) return;
    const base = loadSettings(window.localStorage);
    const updated: Settings = {
      ...base,
      mode: mode.id === 'demo' ? 'demo' : 'live',
      forceDemo: mode.id === 'forceDemo',
    };
    saveSettings(window.localStorage, updated);
    setSettings(updated);
    applyModeChip(document, resolveMode(updated, apiKey));
    pushLog('debug', `模式切到${mode.label}`);
  }

  function sendBubble(): void {
    const text = bubble.trim();
    if (!text) return;
    showBubble(text);
    pushLog('system', text);
    setBubble('');
  }

  const modeStatus = describeMode(settings, apiKey);
  const modeChoice: ModeChoice = settings.forceDemo ? 'forceDemo' : settings.mode;
  const renderer = RENDERERS.find((item) => item.id === prefs.renderer) ?? RENDERERS[0];

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <Section title="状态" description="每秒刷新一次。">
        <dl className="flex flex-col gap-1.5 text-xs">
          <Row label="回合" value={chatStatus} />
          <Row label="立绘" value={snapshot.stage} />
          <Row label="情绪" value={`${emotion} · ${EMOTION_LABEL[emotion]}`} />
          <Row label="姿态" value={snapshot.pose} />
          <Row label="渲染器" value={snapshot.renderer} />
          <Row label="FPS" value={snapshot.fps} />
          <Row label="DPR" value={snapshot.dpr} />
          <Row label="模式" value={modeStatus.mode === 'live' ? '实时' : '演示'} />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          {`2D ${snapshot.context2d ? '✓' : '✗'} · 素材 ${snapshot.stage === 'ready' ? '6/6' : '—'} · 减弱动效 ${snapshot.reduced ? '开' : '关'}`}
        </p>
      </Section>

      <Section title="强制情绪" description="绕过模型和分类器，日志记「调试」；最短停留 2 秒。">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={emotion}
          onValueChange={chooseEmotion}
          aria-label="强制情绪"
          className="w-full"
        >
          {EMOTIONS.map((id) => (
            <ToggleGroupItem key={id} value={id} className="flex-1">
              {EMOTION_LABEL[id]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="灯光主题" description="背景、暗角与浮尘一起过渡；选择会记住。">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={prefs.light}
          onValueChange={chooseLight}
          aria-label="灯光主题"
          className="grid grid-cols-2 gap-1"
        >
          {LIGHT_THEMES.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="渲染器" description={renderer?.hint}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={prefs.renderer}
          onValueChange={chooseRenderer}
          aria-label="渲染器"
          className="w-full"
        >
          {RENDERERS.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id} className="flex-1">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="模式" description={modeStatus.reason}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={modeChoice}
          onValueChange={chooseMode}
          aria-label="回复模式"
          className="w-full"
        >
          {MODES.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id} className="flex-1">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="mt-2 text-xs text-muted-foreground">
          端点与密钥在
          <button
            type="button"
            onClick={() => requestSettings('providers')}
            className="mx-1 underline underline-offset-2 hover:text-foreground"
          >
            设置窗口
          </button>
          。
        </p>
      </Section>

      <Section title="系统气泡" description="直接写在立绘上方，不改情绪、不走模型。">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendBubble();
          }}
        >
          <Input
            value={bubble}
            maxLength={60}
            placeholder="对她说一句…"
            aria-label="系统气泡"
            className="h-8 text-xs"
            onChange={(event) => setBubble(event.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!bubble.trim()}>
            发送
          </Button>
        </form>
      </Section>

      <Section
        title="日志"
        description={`最近 ${LOG_LIMIT} 条，刷新即清空。`}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-muted-foreground"
            onClick={clearLog}
            disabled={entries.length === 0}
          >
            <Trash2Icon className="size-3.5" />
            清空
          </Button>
        }
      >
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">还没有日志。</p>
        ) : (
          <ol className="flex max-h-72 flex-col gap-2">
            {[...entries].reverse().map((entry) => {
              const source = SOURCE[entry.source];
              return (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', source.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{source.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {clock(entry.at)}
                      </span>
                    </div>
                    <p className="break-words text-foreground/90">{entry.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="fixed top-3 right-3 z-40">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={open ? '关闭调试面板' : '打开调试面板'}
              aria-expanded={open}
              aria-controls="debug-panel"
              className="max-md:size-11 bg-background/80 backdrop-blur"
              onClick={() => updatePrefs({ open: !open })}
            >
              {open ? <XIcon /> : <PanelRightIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{open ? '关闭调试面板' : '打开调试面板'}</TooltipContent>
        </Tooltip>
      </div>

      {open && isDesktop ? (
        <aside
          id="debug-panel"
          className="hidden h-dvh w-90 shrink-0 flex-col border-l bg-card/40 pr-12 md:flex"
          aria-label="调试面板"
        >
          <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-sm font-semibold">
            调试面板
            {reduced ? (
              <Badge variant="secondary" className="text-xs">
                已降级
              </Badge>
            ) : null}
          </div>
          {body}
        </aside>
      ) : null}

      {!isDesktop ? (
        <Sheet open={open} onOpenChange={(next) => updatePrefs({ open: next })}>
          <SheetContent
            id="debug-panel"
            side="right"
            className="flex w-[85vw] max-w-sm flex-col p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="flex items-center gap-2 px-3 pt-3 pb-1 text-left text-sm font-semibold">
              调试面板
              {reduced ? (
                <Badge variant="secondary" className="text-xs">
                  已降级
                </Badge>
              ) : null}
            </SheetTitle>
            {body}
          </SheetContent>
        </Sheet>
      ) : null}
    </TooltipProvider>
  );
}
