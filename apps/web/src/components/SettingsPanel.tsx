import { cn } from 'cn';
import {
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  type LucideIcon,
  MessagesSquareIcon,
  PaletteIcon,
  PlugIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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

const SECTIONS: ReadonlyArray<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'connection', label: '连接', icon: PlugIcon },
  { id: 'model', label: '模型调用', icon: SlidersHorizontalIcon },
  { id: 'mode', label: '模式', icon: MessagesSquareIcon },
  { id: 'appearance', label: '外观', icon: PaletteIcon },
  { id: 'data', label: '数据', icon: DatabaseIcon },
  { id: 'about', label: '关于', icon: InfoIcon },
];

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
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Card>
        <CardContent className="divide-y py-0">{children}</CardContent>
      </Card>
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
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
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
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-4">
      <label htmlFor={id} className="text-sm font-medium">
        {title}
      </label>
      {children}
      {description ? (
        <p className="text-sm leading-normal text-muted-foreground">{description}</p>
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

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    setSettings(stored);
    setApiKey(readApiKey(window.sessionStorage, window.localStorage));
    applyAppearance(document.documentElement, stored);
  }, []);

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

  return (
    <>
      <Toaster position="bottom-right" />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        <nav aria-label="设置分区" className="hidden w-44 shrink-0 lg:sticky lg:top-6 lg:block">
          <div className="flex flex-col gap-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={'#' + id}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-8">
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

          <nav aria-label="设置分区" className="-mt-2 flex flex-wrap gap-2 lg:hidden">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={'#' + id}
                className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground"
              >
                {label}
              </a>
            ))}
          </nav>

          <Section id="connection" title="连接">
            <FieldRow
              id="set-endpoint"
              title="端点"
              description={hint ?? 'OpenAI 兼容的 base URL，末尾不用带 /chat/completions。'}
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
              />
            </FieldRow>

            <FieldRow
              id="set-model"
              title="模型"
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
              />
            </FieldRow>

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

            <FieldRow
              id="set-key"
              title="API key"
              description="存 sessionStorage：刷新还在，关掉标签页即清除；请求时经代理内存转发，不写日志。"
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

          <Section id="model" title="模型调用">
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

          <Section id="mode" title="模式">
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

          <Section id="appearance" title="外观">
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
                  aria-label="浮置面板透明度"
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

          <Section id="data" title="数据">
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

          <Section id="about" title="关于">
            <AboutRow label="版本" value="0.1.0" />
            <AboutRow label="角色素材" value="CC BY-NC-SA 4.0 · 非商业演示" />
            <AboutRow label="登录" value="占位页，不接后端" />
          </Section>
        </div>
      </div>
    </>
  );
}
