import { cn } from 'cn';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  FlaskConicalIcon,
  type LucideIcon,
  PaletteIcon,
  PlugIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
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
  applyAppearance,
  applyModeChip,
  clearApiKey,
  clearSettings,
  DEFAULT_SETTINGS,
  describeMode,
  EFFORT_LABEL,
  EFFORT_ORDER,
  type Effort,
  endpointHint,
  loadSettings,
  MODEL_PRESET_LIMIT,
  type ModelPreset,
  type Motion,
  readApiKey,
  type Settings,
  saveApiKey,
  saveSettings,
} from '@/lib/chat/settings';
import { type ProbeResult, probeReadiness, runProbe } from '@/lib/chat/test-connection';
import { announceSettings } from '@/lib/ui/open-settings';

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

type StepId = 'connection' | 'test' | 'appearance' | 'more';

const STEPS: ReadonlyArray<{ id: StepId; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'connection', label: '连接', icon: PlugIcon, hint: '端点、模型与 key' },
  { id: 'test', label: '测试连接', icon: FlaskConicalIcon, hint: '发一次最小请求' },
  { id: 'appearance', label: '模式与外观', icon: PaletteIcon, hint: '回复来源、透明度、动效' },
  { id: 'more', label: '更多', icon: SlidersHorizontalIcon, hint: '模型调用、数据与关于' },
];

/** Four steps in two groups: one row of chips on a phone, a nav on a desktop. */
const STEP_GROUPS: ReadonlyArray<{ id: string; label: string; steps: ReadonlyArray<StepId> }> = [
  { id: 'access', label: '接入模型', steps: ['connection', 'test'] },
  { id: 'use', label: '使用与数据', steps: ['appearance', 'more'] },
];

/** Older links pointed at one section; each still lands on the step that owns it. */
const HASH_STEPS: Record<string, StepId> = {
  connection: 'connection',
  test: 'test',
  mode: 'appearance',
  appearance: 'appearance',
  model: 'more',
  data: 'more',
  about: 'more',
};

const STEP_ORDER = STEPS.map((item) => item.id);

function stepAt(step: StepId, offset: number): StepId | null {
  const index = STEP_ORDER.indexOf(step) + offset;
  return STEP_ORDER[index] ?? null;
}

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
  children,
  active = true,
  tightTitle = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  /** One step shows at a time; hidden steps stay mounted so fields keep focus. */
  active?: boolean;
  /** A one-section step repeats its title in the chips row, so a phone can skip it. */
  tightTitle?: boolean;
}) {
  return (
    <section id={id} className={cn('flex scroll-mt-6 flex-col gap-2', !active && 'hidden')}>
      <h2 className={cn('text-sm font-semibold tracking-tight', tightTitle && 'max-sm:sr-only')}>
        {title}
      </h2>
      <Card>
        <CardContent className="divide-y py-0">{children}</CardContent>
      </Card>
    </section>
  );
}

/** The step list: a grouped nav on a desktop, one scrollable row of chips on a phone. */
function StepNav({ step, onGo }: { step: StepId; onGo: (next: StepId) => void }) {
  return (
    <>
      <nav aria-label="设置步骤" className="hidden w-44 shrink-0 lg:block">
        {STEP_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1 pb-4">
            <p className="px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.steps.map((id) => {
              const item = STEPS.find((candidate) => candidate.id === id);
              if (!item) return null;
              const Icon = item.icon;
              const current = id === step;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={current ? 'step' : undefined}
                  onClick={() => onGo(id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    current
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <nav
        aria-label="设置步骤"
        className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden"
      >
        {STEPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={id === step ? 'step' : undefined}
            onClick={() => onGo(id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-2 text-xs transition-colors',
              id === step
                ? 'border-foreground/20 bg-secondary text-secondary-foreground'
                : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
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
          <p className="text-sm leading-normal text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">{children}</div>
      ) : null}
    </div>
  );
}

/** A full-width control under its own label, for text fields. */
function FieldRow({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  /** A receipt or hint that sits beside the label, not under it. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2 sm:py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        {aside}
      </div>
      {children}
      {description ? (
        <p className="text-xs leading-snug text-muted-foreground sm:text-sm">{description}</p>
      ) : null}
    </div>
  );
}

/** A full-width block whose label is not attached to one input. */
function Block({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-4">
      <span className="text-sm font-medium">{title}</span>
      {children}
      {description ? (
        <p className="text-sm leading-normal text-muted-foreground">{description}</p>
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

/** A field-level receipt: it appears after a commit and leaves on its own. */
function SavedReceipt({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span role="status" className="text-xs text-muted-foreground">
      已保存
    </span>
  );
}

const PROBE_TONE: Record<ProbeResult['outcome'], string> = {
  ok: 'text-emerald-400',
  incomplete: 'text-muted-foreground',
  unauthorized: 'text-destructive',
  unreachable: 'text-destructive',
};

const PROBE_LABEL: Record<ProbeResult['outcome'], string> = {
  ok: '通过',
  incomplete: '未填完',
  unauthorized: 'key 被拒',
  unreachable: '端点不可达',
};

function ProbeLine({ result }: { result: ProbeResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-sm', PROBE_TONE[result.outcome])}>
      {PROBE_LABEL[result.outcome]} · {result.reason}
    </p>
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

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [step, setStep] = useState<StepId>('connection');
  const [savedField, setSavedField] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ running: boolean; result: ProbeResult | null }>({
    running: false,
    result: null,
  });
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    setSettings(stored);
    setApiKey(readApiKey(window.sessionStorage, window.localStorage));
    applyAppearance(document.documentElement, stored);
    const fromHash = HASH_STEPS[window.location.hash.slice(1)];
    if (fromHash) setStep(fromHash);
  }, []);

  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  /** One step at a time; the hash keeps a step link shareable. */
  function go(next: StepId): void {
    setStep(next);
    window.history.replaceState(window.history.state, '', '#' + next);
  }

  function flashSaved(field: string): void {
    setSavedField(field);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedField(null), 1600);
  }

  async function testConnection(): Promise<void> {
    setProbe({ running: true, result: null });
    setProbe({ running: false, result: await runProbe(settings, apiKey) });
  }

  function syncChip(next: Settings, key: string): void {
    applyModeChip(document, describeMode(next, key).mode);
  }

  function update(patch: Partial<Settings>): void {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(window.localStorage, next);
    applyAppearance(document.documentElement, next);
    syncChip(next, apiKey);
    announceSettings();
  }

  function pickMode(choice: ModeChoice): void {
    const next = choice === 'force' ? { forceDemo: true } : { forceDemo: false, mode: choice };
    update(next);
    // The chip shows what is in effect, not what was asked for.
    const status = describeMode({ ...settings, ...next }, apiKey);
    toast.success(status.mode === 'live' ? '已切到实时模式' : '仍是演示模式 · ' + status.reason);
  }

  function changeKey(value: string): void {
    setApiKey(value);
    saveApiKey(window.sessionStorage, value);
    syncChip(settings, value);
  }

  function addModelPreset(): void {
    if (settings.modelPresets.length >= MODEL_PRESET_LIMIT) return;
    const id = 'm-' + Date.now().toString(36);
    update({ modelPresets: [...settings.modelPresets, { id, label: '', model: '' }] });
  }

  function patchModelPreset(id: string, patch: Partial<ModelPreset>): void {
    update({
      modelPresets: settings.modelPresets.map((preset) =>
        preset.id === id ? { ...preset, ...patch } : preset,
      ),
    });
  }

  function removeModelPreset(id: string): void {
    update({ modelPresets: settings.modelPresets.filter((preset) => preset.id !== id) });
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

  function removeKey(): void {
    clearApiKey(window.sessionStorage, window.localStorage);
    setApiKey('');
    syncChip(settings, '');
    toast.success('API key 已清除');
  }

  function reset(): void {
    clearSettings(window.localStorage);
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    applyAppearance(document.documentElement, next);
    syncChip(next, apiKey);
    toast.success('已恢复默认设置');
  }

  const status = describeMode(settings, apiKey);
  const live = status.mode === 'live';
  const wantsLive = settings.mode === 'live' && !settings.forceDemo;
  const statusLine = live
    ? '实时模式 · ' + status.reason
    : wantsLive
      ? '演示模式 · 已选实时，' + status.reason
      : '演示模式 · ' + status.reason;
  const hint = endpointHint(settings.endpoint, settings.direct);
  const blocked = probeReadiness(settings, apiKey);
  const previous = stepAt(step, -1);
  const next = stepAt(step, 1);
  const nextLabel = next ? STEPS.find((item) => item.id === next)?.label : null;

  return (
    <>
      {/* Top centre: the wizard's next button owns the bottom right corner. */}
      <Toaster position="top-center" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
        <StepNav step={step} onGo={go} />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Section id="connection" title="连接" active={step === 'connection'} tightTitle>
            <FieldRow
              id="set-endpoint"
              title="端点"
              aside={<SavedReceipt show={savedField === 'endpoint'} />}
              description={hint ?? 'OpenAI 兼容的 base URL，末尾不带 /chat/completions。'}
            >
              <Input
                id="set-endpoint"
                type="url"
                inputMode="url"
                spellCheck={false}
                autoComplete="off"
                placeholder="https://api.openai.com/v1"
                value={settings.endpoint}
                aria-invalid={Boolean(hint)}
                onChange={(event) => update({ endpoint: event.target.value })}
                onBlur={() => flashSaved('endpoint')}
              />
            </FieldRow>

            <FieldRow
              id="set-model"
              title="模型"
              aside={<SavedReceipt show={savedField === 'model'} />}
              description="端点决定模型名怎么写，一般和端点文档一致。"
            >
              <Input
                id="set-model"
                spellCheck={false}
                autoComplete="off"
                placeholder="gpt-4o-mini"
                value={settings.model}
                aria-invalid={settings.endpoint.trim().length > 0 && !settings.model.trim()}
                onChange={(event) => update({ model: event.target.value })}
                onBlur={() => flashSaved('model')}
              />
              {settings.endpoint.trim().length > 0 && !settings.model.trim() ? (
                <p className="text-sm text-destructive">请填写模型名，例如 gpt-4o-mini</p>
              ) : null}
            </FieldRow>

            <FieldRow
              id="set-key"
              title="API key"
              aside={<SavedReceipt show={savedField === 'key'} />}
              description="只留在当前标签页，关掉即清除；请求时内存转发，不写日志。"
            >
              <InputGroup>
                <InputGroupInput
                  id="set-key"
                  type={showKey ? 'text' : 'password'}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={settings.direct ? '直连时可以空着' : 'sk-…'}
                  value={apiKey}
                  onChange={(event) => changeKey(event.target.value)}
                  onBlur={() => flashSaved('key')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    variant="ghost"
                    size="icon-xs"
                    aria-label={showKey ? '隐藏 key' : '显示 key'}
                    aria-pressed={showKey}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOffIcon /> : <EyeIcon />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </FieldRow>

            <Row
              title="直连端点"
              description="浏览器直接请求，不经过代理。本机模型或允许 CORS 的端点用这个。"
            >
              <Switch
                id="set-direct"
                aria-label="直连端点"
                checked={settings.direct}
                onCheckedChange={(checked) => {
                  update({ direct: checked });
                  toast.success(checked ? '已打开直连' : '已关闭直连');
                }}
              />
            </Row>
          </Section>

          <Section id="test" title="测试连接" active={step === 'test'} tightTitle>
            <Block
              title="发一次最小请求"
              description="只发一句 ping：不写设置、不进对话记录、不重试。直连与经代理都会走各自真实的路径。"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    disabled={probe.running || blocked !== null}
                    onClick={() => void testConnection()}
                  >
                    <FlaskConicalIcon data-icon="inline-start" />
                    {probe.running ? '正在测试…' : '测试连接'}
                  </Button>
                  {blocked ? (
                    <span className="text-sm text-muted-foreground">{blocked}</span>
                  ) : null}
                </div>
                {probe.result ? (
                  <ProbeLine result={probe.result} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    还没测过。<span className="font-mono">/api/chat</span>{' '}
                    与本机直连都会按当前设置发一次。
                  </p>
                )}
              </div>
            </Block>
          </Section>

          <Section id="model" title="模型调用" active={step === 'more'}>
            <Block
              title="模型预设"
              description={`同一个端点下常用的模型名，最多 ${MODEL_PRESET_LIMIT} 个；对话输入框旁的菜单可以直接切换。`}
            >
              <div className="flex flex-col gap-2">
                {settings.modelPresets.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-2">
                    <Input
                      aria-label="预设名称"
                      className="w-28"
                      maxLength={24}
                      placeholder="名称"
                      spellCheck={false}
                      value={preset.label}
                      onChange={(event) =>
                        patchModelPreset(preset.id, { label: event.target.value })
                      }
                    />
                    <Input
                      aria-label="预设模型名"
                      autoComplete="off"
                      className="flex-1"
                      placeholder="gpt-4o-mini"
                      spellCheck={false}
                      value={preset.model}
                      onChange={(event) =>
                        patchModelPreset(preset.id, { model: event.target.value })
                      }
                    />
                    <Button
                      aria-label={`删除预设${preset.label || preset.model}`}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => removeModelPreset(preset.id)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
                <Button
                  className="w-fit"
                  disabled={settings.modelPresets.length >= MODEL_PRESET_LIMIT}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={addModelPreset}
                >
                  <PlusIcon data-icon="inline-start" />
                  添加模型预设
                </Button>
              </div>
            </Block>

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

            <Block
              title="思考强度"
              description="推理模型的思考强度，请求里作为 reasoning_effort 发给端点。默认关：不带这个字段，普通模型不会因为多一个参数报错；端点不支持某一档时也会直接拒绝。"
            >
              <ToggleGroup
                type="single"
                variant="outline"
                value={settings.effort}
                aria-label="思考强度"
                className="flex-wrap justify-start"
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
                {EFFORT_ORDER.map((id) => (
                  <ToggleGroupItem key={id} value={id}>
                    {EFFORT_LABEL[id]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Block>
          </Section>

          <Section id="mode" title="模式" active={step === 'appearance'}>
            <div
              className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              data-mode={status.mode}
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  live ? 'bg-emerald-400' : 'bg-muted-foreground',
                )}
              />
              <span>当前生效：{statusLine}</span>
            </div>
            <Row
              title="回复来源"
              description={
                live
                  ? '新消息发给你的端点；请求失败或返回空文本时改用本地模板，气泡标「模板回复」。'
                  : wantsLive
                    ? '已选实时，但' +
                      status.reason +
                      '。填好端点和 API key 后，新消息才会发给你的端点。'
                    : '回复来自本地模板，不发任何网络请求。填好端点并选「实时」才会调用模型。'
              }
            >
              <ToggleGroup
                type="single"
                variant="outline"
                value={modeChoice(settings)}
                aria-label="回复来源"
                onValueChange={(value) => {
                  if (value) pickMode(value as ModeChoice);
                }}
              >
                {MODE_OPTIONS.map((option) => (
                  <ToggleGroupItem key={option.id} value={option.id}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
          </Section>

          <Section id="appearance" title="外观" active={step === 'appearance'}>
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

            <Row title="动效" description="关掉舞台浮尘、打字点与面板过渡的动画。">
              <ToggleGroup
                type="single"
                variant="outline"
                value={settings.motion}
                aria-label="动效"
                onValueChange={(value) => {
                  if (!value) return;
                  update({ motion: value as Motion });
                  toast.success('动效已保存');
                }}
              >
                {MOTION_OPTIONS.map((option) => (
                  <ToggleGroupItem key={option.id} value={option.id}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
          </Section>

          <Section id="data" title="数据" active={step === 'more'}>
            <Row
              title="清空对话历史"
              description="本机最多 20 段对话、每段 100 条消息会从 localStorage 删除，操作不可撤销。"
            >
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">清空对话历史</Button>
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

            <Row title="清除 API key" description="清除后实时模式会退回演示，直到重新填入。">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={!apiKey}>
                    清除 API key
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>清除当前标签页里的 API key？</AlertDialogTitle>
                    <AlertDialogDescription>
                      清除后实时模式会退回演示，直到重新填入。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={removeKey}>清除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>

            <Row
              title="恢复默认设置"
              description="端点、模型、模型调用与外观都会回到初始值；API key 不动。"
            >
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">恢复默认设置</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>恢复默认设置？</AlertDialogTitle>
                    <AlertDialogDescription>
                      端点、模型、模型调用与外观都会回到初始值，API key 不动。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={reset}>恢复</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>
          </Section>

          <Section id="about" title="关于" active={step === 'more'}>
            <AboutRow label="版本" value="0.1.0" />
            <AboutRow label="角色素材" value="CC BY-NC-SA 4.0 · 非商业演示" />
            <AboutRow label="登录" value="占位页，不接后端" />
          </Section>

          <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-between gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
            {previous ? (
              <Button type="button" variant="ghost" onClick={() => go(previous)}>
                <ArrowLeftIcon data-icon="inline-start" />
                上一步
              </Button>
            ) : (
              <span />
            )}
            {next && nextLabel ? (
              <Button type="button" onClick={() => go(next)}>
                下一步：{nextLabel}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button">完成</Button>
              </DialogClose>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
