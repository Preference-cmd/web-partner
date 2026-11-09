import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import {
  BoxesIcon,
  DatabaseIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Toaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CONTEXT_MAX, CONTEXT_MIN, OUTPUT_MAX, OUTPUT_MIN } from '@/lib/chat/llm';
import { createSessionStorage } from '@/lib/chat/session-storage';
import {
  ALPHA_DEFAULT,
  ALPHA_MAX,
  ALPHA_MIN,
  activeTarget,
  applyAppearance,
  applyModeChip,
  clampEffort,
  clearAllProviderKeys,
  clearProviderKey,
  clearSettings,
  currentApiKey,
  DEFAULT_SETTINGS,
  describeMode,
  EFFORT_LABEL,
  type Effort,
  effortOptions,
  loadSettings,
  type Motion,
  modelLabel,
  normalizeActive,
  PROTOCOL_LABEL,
  PROVIDER_LIMIT,
  type Provider,
  readProviderKey,
  type Settings,
  saveProviderKey,
  saveSettings,
} from '@/lib/chat/settings';
import {
  LIGHT_EVENT,
  LIGHT_THEMES,
  type LightTheme,
  loadPanelPrefs,
  setLight,
} from '@/lib/debug/prefs';
import { announceSettings } from '@/lib/ui/open-settings';
import ProviderDialog from './ProviderDialog';

const MODE_OPTIONS = [
  { id: 'demo', label: '演示' },
  { id: 'live', label: '实时' },
  { id: 'force', label: '强制演示' },
] as const;

const MOTION_OPTIONS: ReadonlyArray<{ id: Motion; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'reduced', label: '减少动效' },
  { id: 'full', label: '完整' },
];

type SectionId = 'providers' | 'usage' | 'appearance' | 'data';

interface SectionSpec {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  group: string;
}

const SECTIONS: readonly SectionSpec[] = [
  { id: 'providers', label: '供应商', icon: BoxesIcon, group: '接入' },
  { id: 'usage', label: '对话与调用', icon: SlidersHorizontalIcon, group: '接入' },
  { id: 'appearance', label: '外观', icon: PaletteIcon, group: '应用' },
  { id: 'data', label: '数据', icon: DatabaseIcon, group: '其他' },
];

const GROUPS = ['接入', '应用', '其他'] as const;

/** Old links still land on the section that owns them; #about now opens 数据. */
const HASH_SECTIONS: Record<string, SectionId> = {
  providers: 'providers',
  connection: 'providers',
  model: 'providers',
  test: 'providers',
  usage: 'usage',
  mode: 'usage',
  appearance: 'appearance',
  data: 'data',
  about: 'data',
};

type ModeChoice = (typeof MODE_OPTIONS)[number]['id'];

/** The chat controller outlives this page; clearing history must reach it. */
interface ClearableChat {
  resetAll: () => void;
}

function chatController(): ClearableChat | undefined {
  return (globalThis as { __partnerChat?: ClearableChat }).__partnerChat;
}

function modeChoice(settings: Settings): ModeChoice {
  if (settings.forceDemo) return 'force';
  return settings.mode;
}

function Section({
  id,
  title,
  description,
  aside,
  card = true,
  hidden = false,
  children,
}: {
  id: SectionId;
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  card?: boolean;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={`settings-${id}`} aria-labelledby={`settings-${id}-title`} hidden={hidden}>
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 id={`settings-${id}-title`} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
        {description ? (
          <p className="max-w-[62ch] text-sm leading-normal text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {card ? (
        <Card>
          <CardContent className="divide-y py-0">{children}</CardContent>
        </Card>
      ) : (
        children
      )}
    </section>
  );
}

/** Title and description on the left, one control on the right. */
function Row({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
}) {
  const label = htmlFor ? (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {title}
    </label>
  ) : (
    <span className="text-sm font-medium">{title}</span>
  );
  return (
    <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:py-3">
      <div className="flex min-w-0 flex-col gap-1">
        {label}
        {description ? (
          <p className="max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">{children}</div>
      ) : null}
    </div>
  );
}

/** A number the settings page commits on blur or Enter, clamped to its range. */
function TokenField({
  id,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(): void {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="w-24 text-right font-mono"
    />
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ProviderCard({
  provider,
  active,
  activeModel,
  onSelectProvider,
  onSelectModel,
  onEdit,
  onDelete,
}: {
  provider: Provider;
  active: boolean;
  activeModel: string;
  onSelectProvider: (provider: Provider) => void;
  onSelectModel: (providerId: string, model: string) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 shadow-sm transition-colors',
        active
          ? 'border-transparent bg-brand/15 ring-1 ring-inset ring-brand/40'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onSelectProvider(provider)}
          className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{provider.name}</span>
            {active ? <Badge className="shrink-0">当前</Badge> : null}
            <Badge variant="secondary" className="shrink-0 text-xs font-normal">
              {PROTOCOL_LABEL[provider.protocol]}
            </Badge>
          </span>
          <span className="w-full truncate font-mono text-xs text-muted-foreground">
            {provider.baseUrl || '还没填 base URL'}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            aria-label={`编辑 ${provider.name}`}
            className="max-md:size-11"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onEdit(provider)}
          >
            <PencilIcon />
          </Button>
          <Button
            aria-label={`删除 ${provider.name}`}
            className="max-md:size-11"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onDelete(provider)}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">模型</span>
        {provider.models.length === 0 ? (
          <span className="text-xs text-destructive">还没加模型</span>
        ) : (
          provider.models.map((model) => {
            const chosen = active && activeModel === model.model;
            return (
              <button
                key={model.id}
                type="button"
                aria-pressed={chosen}
                onClick={() => onSelectModel(provider.id, model.model)}
                className={cn(
                  'max-md:min-h-11 rounded-full px-2.5 py-1 text-xs transition-colors',
                  chosen
                    ? 'bg-brand/15 text-foreground ring-1 ring-inset ring-brand/40'
                    : 'bg-foreground/[0.06] text-muted-foreground hover:bg-accent',
                )}
              >
                {modelLabel(model)}
              </button>
            );
          })
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {provider.efforts.length > 0
          ? `思考强度 ${provider.efforts.map((effort) => EFFORT_LABEL[effort]).join(' / ')}`
          : '没开思考强度'}
        {' · '}
        {provider.direct ? '浏览器直连' : '经代理'}
      </p>
    </div>
  );
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [light, setLightState] = useState<LightTheme>('night');
  // Resolve the hash during the first render, so the selected tab is already
  // correct when Radix places the dialog's initial focus.
  const [section, setSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return 'providers';
    return HASH_SECTIONS[window.location.hash.slice(1)] ?? 'providers';
  });
  const [editor, setEditor] = useState<{
    open: boolean;
    provider: Provider | null;
    key: string;
  }>({ open: false, provider: null, key: '' });
  const [pendingDelete, setPendingDelete] = useState<Provider | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** Switch the visible panel and keep the hash shareable. */
  const go = useCallback((next: SectionId): void => {
    setSection(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.history.replaceState(window.history.state, '', `#${next}`);
  }, []);

  /** Roving tab order: arrows and Home/End move between the sections. */
  function onTabKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const index = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    if (index < 0 || tabs.length === 0) return;
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      next = (index + step + tabs.length) % tabs.length;
    }
    event.preventDefault();
    const id = SECTIONS[next]?.id;
    if (id) go(id);
    // React reuses these nodes, so focusing now survives the state update.
    tabs[next]?.focus();
  }

  /** A click must move focus with the selection, including programmatic ones. */
  function pickTab(event: React.MouseEvent<HTMLButtonElement>, id: SectionId): void {
    go(id);
    event.currentTarget.focus();
  }

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    setSettings(stored);
    applyAppearance(document.documentElement, stored);
    setLightState(loadPanelPrefs(window.localStorage).light);
    // The debug drawer can change the light while this dialog is open.
    const sync = (event: Event): void => {
      const detail = (event as CustomEvent<{ light?: LightTheme }>).detail;
      if (detail?.light) setLightState(detail.light);
    };
    // A hash link can arrive while the dialog is already open.
    const onHash = (): void => {
      const next = HASH_SECTIONS[window.location.hash.slice(1)];
      if (next) go(next);
    };
    window.addEventListener(LIGHT_EVENT, sync);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener(LIGHT_EVENT, sync);
      window.removeEventListener('hashchange', onHash);
    };
  }, [go]);

  function syncChip(next: Settings): void {
    const key = currentApiKey(next, window.sessionStorage, window.localStorage);
    applyModeChip(document, describeMode(next, key).mode);
  }

  function commit(next: Settings): void {
    setSettings(next);
    saveSettings(window.localStorage, next);
    applyAppearance(document.documentElement, next);
    syncChip(next);
    announceSettings();
  }

  function openEditor(provider: Provider | null): void {
    setEditor({
      open: true,
      provider,
      key: provider ? readProviderKey(window.sessionStorage, window.localStorage, provider.id) : '',
    });
  }

  function saveProvider(next: Provider, key: string): void {
    const exists = settings.providers.some((provider) => provider.id === next.id);
    const providers = exists
      ? settings.providers.map((provider) => (provider.id === next.id ? next : provider))
      : [...settings.providers, next].slice(0, PROVIDER_LIMIT);
    const withProvider: Settings = exists
      ? { ...settings, providers }
      : {
          ...settings,
          providers,
          activeProviderId: next.id,
          activeModel: next.models[0]?.model ?? '',
        };
    commit(normalizeActive(withProvider));
    if (key) saveProviderKey(window.sessionStorage, next.id, key);
    else clearProviderKey(window.sessionStorage, window.localStorage, next.id);
    setEditor({ open: false, provider: null, key: '' });
    toast.success(exists ? `已保存 ${next.name}` : `已添加 ${next.name}`);
  }

  function selectProvider(provider: Provider): void {
    commit(
      normalizeActive({
        ...settings,
        activeProviderId: provider.id,
        activeModel: provider.models[0]?.model ?? '',
      }),
    );
  }

  function selectModel(providerId: string, model: string): void {
    commit(normalizeActive({ ...settings, activeProviderId: providerId, activeModel: model }));
  }

  function deleteProvider(provider: Provider): void {
    const providers = settings.providers.filter((entry) => entry.id !== provider.id);
    clearProviderKey(window.sessionStorage, window.localStorage, provider.id);
    commit(normalizeActive({ ...settings, providers }));
    setPendingDelete(null);
    toast.success(`已删除 ${provider.name}`);
  }

  function update(patch: Partial<Settings>): void {
    commit(normalizeActive({ ...settings, ...patch }));
  }

  function pickMode(choice: ModeChoice): void {
    const next = normalizeActive({
      ...settings,
      ...(choice === 'force' ? { forceDemo: true } : { forceDemo: false, mode: choice }),
    });
    commit(next);
    // The chip shows what is in effect, not what was asked for.
    const status = describeMode(
      next,
      currentApiKey(next, window.sessionStorage, window.localStorage),
    );
    toast.success(status.mode === 'live' ? '已切到实时模式' : '仍是演示模式 · ' + status.reason);
  }

  function clearHistory(): void {
    const controller = chatController();
    if (controller) {
      controller.resetAll();
    } else {
      createSessionStorage(window.localStorage).clearAll();
    }
    toast.success('历史已清空');
  }

  function removeKeys(): void {
    clearAllProviderKeys(window.sessionStorage, window.localStorage);
    syncChip(settings);
    toast.success('已清除全部 API key');
  }

  function reset(): void {
    clearSettings(window.localStorage);
    const next = { ...DEFAULT_SETTINGS };
    commit(next);
    toast.success('已恢复默认设置');
  }

  const apiKey = currentApiKey(settings, window.sessionStorage, window.localStorage);
  const status = describeMode(settings, apiKey);
  const live = status.mode === 'live';
  const wantsLive = settings.mode === 'live' && !settings.forceDemo;
  const statusLine = live
    ? '实时模式 · ' + status.reason
    : wantsLive
      ? '演示模式 · 已选实时，' + status.reason
      : '演示模式 · ' + status.reason;
  const target = activeTarget(settings);
  const provider = target?.provider;
  const effortNow = clampEffort(settings.effort, provider);
  const effortChoices = effortOptions(provider);

  return (
    <>
      {/* Top centre: a save receipt should not sit under the pointer. */}
      <Toaster position="top-center" />
      <div className="grid h-full min-h-0 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div
          aria-label="设置分区"
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={onTabKeyDown}
          className="hidden min-h-0 flex-col gap-5 overflow-y-auto px-3 py-5 lg:flex"
        >
          {GROUPS.map((group) => (
            <div key={group} role="presentation" className="flex flex-col gap-1">
              <p role="presentation" className="px-3 text-xs font-medium text-muted-foreground">
                {group}
              </p>
              {SECTIONS.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => {
                const current = id === section;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${id}`}
                    aria-selected={current}
                    aria-controls="settings-tabpanel"
                    tabIndex={current ? 0 : -1}
                    onClick={(event) => pickTab(event, id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      current
                        ? 'bg-brand/15 text-foreground ring-1 ring-inset ring-brand/40'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <p className="mt-auto px-3 pt-4 text-xs leading-snug text-muted-foreground">
            按 Esc 关闭
          </p>
        </div>

        <div className="flex min-h-0 flex-col">
          <div
            aria-label="设置分区"
            role="tablist"
            aria-orientation="horizontal"
            onKeyDown={onTabKeyDown}
            className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 lg:hidden"
          >
            {SECTIONS.map(({ id, label }) => {
              const current = id === section;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`settings-tab-sm-${id}`}
                  aria-selected={current}
                  aria-controls="settings-tabpanel"
                  tabIndex={current ? 0 : -1}
                  onClick={(event) => pickTab(event, id)}
                  className={cn(
                    'min-h-11 shrink-0 rounded-full px-3 text-xs transition-colors',
                    current
                      ? 'bg-brand/15 text-foreground ring-1 ring-inset ring-brand/40'
                      : 'bg-foreground/[0.06] text-muted-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs sm:px-6"
            data-mode={status.mode}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                live ? 'bg-brand-hi' : 'bg-muted-foreground',
              )}
            />
            <span>{statusLine}</span>
          </div>

          <div
            ref={scrollRef}
            id="settings-tabpanel"
            role="tabpanel"
            aria-label="设置内容"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-[42rem] flex-col px-4 py-5 sm:px-6">
              <Section
                id="providers"
                hidden={section !== 'providers'}
                title="供应商"
                description="一个供应商是一个 base URL、一把 key 和一组模型；对话发往当前供应商的当前模型。"
                aside={
                  settings.providers.length > 0 ? (
                    <Button
                      className="max-md:h-11"
                      size="sm"
                      type="button"
                      onClick={() => openEditor(null)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      添加供应商
                    </Button>
                  ) : null
                }
                card={false}
              >
                {settings.providers.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
                    <BoxesIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium">还没有供应商</p>
                    <p className="max-w-[40ch] text-xs leading-relaxed text-muted-foreground">
                      添加之后，新消息才会离开这台浏览器。
                    </p>
                    <Button className="mt-1 max-md:h-11" onClick={() => openEditor(null)}>
                      <PlusIcon data-icon="inline-start" />
                      添加第一个供应商
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {settings.providers.map((entry) => (
                      <ProviderCard
                        key={entry.id}
                        provider={entry}
                        active={entry.id === settings.activeProviderId}
                        activeModel={settings.activeModel}
                        onSelectProvider={selectProvider}
                        onSelectModel={selectModel}
                        onEdit={openEditor}
                        onDelete={setPendingDelete}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                id="usage"
                title="对话与调用"
                description="回复从哪来、带多少上下文，以及这一轮最多生成多少。"
                hidden={section !== 'usage'}
              >
                <Row
                  title="回复来源"
                  description={
                    live
                      ? '新消息发给当前供应商；请求失败或返回空文本时改用本地模板，气泡标「模板回复」。'
                      : wantsLive
                        ? '已选实时，但' +
                          status.reason +
                          '。补齐供应商的设置后，新消息才会离开这台浏览器。'
                        : '回复来自本地模板，不发任何网络请求。选「实时」才会调用模型。'
                  }
                >
                  <ToggleGroup
                    type="single"
                    className="segmented"
                    value={modeChoice(settings)}
                    aria-label="回复来源"
                    onValueChange={(value) => {
                      if (value) pickMode(value as ModeChoice);
                    }}
                  >
                    {MODE_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.id}
                        value={option.id}
                        className="max-md:min-h-11"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>

                <Row
                  htmlFor="set-output"
                  title="输出预算"
                  description="这一轮最多生成多少 token，思考的 token 也算在里面。推理模型开到高档时给太小，答案会在正文中间截断。"
                >
                  <div className="flex items-center gap-2">
                    <TokenField
                      id="set-output"
                      value={settings.maxOutputTokens}
                      min={OUTPUT_MIN}
                      max={OUTPUT_MAX}
                      onCommit={(value) => {
                        update({ maxOutputTokens: value });
                        toast.success('输出预算已保存');
                      }}
                    />
                    <span className="text-sm text-muted-foreground">tokens</span>
                  </div>
                </Row>

                <Row
                  htmlFor="set-context"
                  title="上下文窗口"
                  description="每次请求带上最近对话的约这么多 token；更早的留在本机。越大越贵，也越慢。"
                >
                  <div className="flex items-center gap-2">
                    <TokenField
                      id="set-context"
                      value={settings.contextTokens}
                      min={CONTEXT_MIN}
                      max={CONTEXT_MAX}
                      onCommit={(value) => {
                        update({ contextTokens: value });
                        toast.success('上下文窗口已保存');
                      }}
                    />
                    <span className="text-sm text-muted-foreground">tokens</span>
                  </div>
                </Row>

                <Row
                  title="思考强度"
                  description={
                    provider
                      ? `当前供应商启用了 ${provider.efforts.length} 档；这一档作为 reasoning_effort 发出去，「关」不带这个字段。`
                      : '先添加供应商，再选思考强度。'
                  }
                >
                  <ToggleGroup
                    type="single"
                    value={effortNow}
                    aria-label="思考强度"
                    className="segmented flex-wrap justify-start"
                    disabled={!provider}
                    onValueChange={(value) => {
                      if (!value) return;
                      update({ effort: value as Effort });
                      toast.success(
                        value === 'off'
                          ? '已关闭思考强度'
                          : `思考强度：${EFFORT_LABEL[value as Effort]}`,
                      );
                    }}
                  >
                    {effortChoices.map((id) => (
                      <ToggleGroupItem key={id} value={id} className="max-md:min-h-11">
                        {EFFORT_LABEL[id]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
              </Section>

              <Section
                id="appearance"
                title="外观"
                description="舞台与面板的观感，不影响请求。"
                hidden={section !== 'appearance'}
              >
                <Row
                  htmlFor="set-alpha"
                  title="浮置面板透明度"
                  description="对话面板背景的不透明度，0.4–0.9；文字始终不透明。"
                >
                  <div className="flex items-center gap-3">
                    <Slider
                      id="set-alpha"
                      min={ALPHA_MIN}
                      max={ALPHA_MAX}
                      step={0.02}
                      value={[settings.panelAlpha]}
                      label="浮置面板透明度"
                      className="w-44"
                      onValueChange={(value) => update({ panelAlpha: value[0] ?? ALPHA_DEFAULT })}
                      onValueCommit={() => toast.success('透明度已保存')}
                    />
                    <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                      {settings.panelAlpha.toFixed(2)}
                    </span>
                  </div>
                </Row>

                <Row
                  title="回复回声"
                  description="她的回复第一句会从舞台落下来，十秒后消失；对话记录不受影响。"
                >
                  <Switch
                    id="set-echo"
                    aria-label="回复回声"
                    checked={settings.echo}
                    onCheckedChange={(checked) => {
                      update({ echo: checked });
                      toast.success(checked ? '已打开回复回声' : '已关闭回复回声');
                    }}
                  />
                </Row>

                <Row
                  title="灯光主题"
                  description="舞台背景、暗角与浮尘一起过渡；选哪套都留在深色里。"
                >
                  <ToggleGroup
                    type="single"
                    value={light}
                    aria-label="灯光主题"
                    className="segmented grid grid-cols-2 gap-1"
                    onValueChange={(value) => {
                      const next = LIGHT_THEMES.find((item) => item.id === value);
                      if (!next) return;
                      setLight(window.localStorage, next.id);
                      setLightState(next.id);
                      toast.success(`灯光：${next.label}`);
                    }}
                  >
                    {LIGHT_THEMES.map((item) => (
                      <ToggleGroupItem key={item.id} value={item.id} className="max-md:min-h-11">
                        {item.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>

                <Row title="动效" description="关掉舞台浮尘、打字点与面板过渡的动画。">
                  <ToggleGroup
                    type="single"
                    className="segmented"
                    value={settings.motion}
                    aria-label="动效"
                    onValueChange={(value) => {
                      if (!value) return;
                      update({ motion: value as Motion });
                      toast.success('动效已保存');
                    }}
                  >
                    {MOTION_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.id}
                        value={option.id}
                        className="max-md:min-h-11"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Row>
              </Section>

              <Section
                id="data"
                title="数据"
                description="这些都在本机，服务器上没有副本；末尾是版本信息。"
                hidden={section !== 'data'}
              >
                <Row
                  title="清空对话历史"
                  description="本机最多 20 段对话、每段 100 条消息会从 localStorage 删除，操作不可撤销。"
                >
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="max-md:h-11">
                        清空对话历史
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>清空本机的对话历史？</AlertDialogTitle>
                        <AlertDialogDescription>
                          本机的最多 20 段对话、每段 100 条消息会从 localStorage
                          删除，这个操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={clearHistory}>
                          清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Row>

                <Row
                  title="清除 API key"
                  description="每个供应商的 key 一起清除；实时模式会退回演示，直到重新填入。"
                >
                  <Button
                    variant="secondary"
                    className="max-md:h-11"
                    disabled={!apiKey}
                    onClick={removeKeys}
                  >
                    清除全部 key
                  </Button>
                </Row>

                <Row
                  title="恢复默认设置"
                  description="供应商、模型调用与外观都会回到初始值；API key 不动。"
                >
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="secondary" className="max-md:h-11">
                        恢复默认设置
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>恢复默认设置？</AlertDialogTitle>
                        <AlertDialogDescription>
                          供应商、模型调用与外观都会回到初始值，API key 不动。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={reset}>恢复</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Row>
                <AboutRow label="版本" value="0.1.0" />
                <AboutRow label="角色素材" value="版权归原作者 · 禁止商用" />
                <AboutRow label="登录" value="占位页，不接后端" />
              </Section>
            </div>
          </div>
        </div>
      </div>

      <ProviderDialog
        open={editor.open}
        provider={editor.provider}
        initialKey={editor.key}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSubmit={saveProvider}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除供应商「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              它的 base URL、模型和 API key 会从这台浏览器删除，对话记录不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) deleteProvider(pendingDelete);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
