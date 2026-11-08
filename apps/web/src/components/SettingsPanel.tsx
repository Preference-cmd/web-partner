import { cn } from 'cn';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Toaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CONTEXT_DEFAULT,
  CONTEXT_MAX,
  CONTEXT_MIN,
  OUTPUT_DEFAULT,
  OUTPUT_MAX,
  OUTPUT_MIN,
  OUTPUT_STEP,
} from '@/lib/chat/llm';
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
  endpointHint,
  loadSettings,
  type Motion,
  readApiKey,
  type Settings,
  saveApiKey,
  saveSettings,
} from '@/lib/chat/settings';

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

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
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
  }

  function pickMode(choice: ModeChoice): void {
    const next = choice === 'force' ? { forceDemo: true } : { forceDemo: false, mode: choice };
    update(next);
    // The chip shows what is in effect, not what was asked for.
    const status = describeMode({ ...settings, ...next }, apiKey);
    toast.success(status.mode === 'live' ? '已切到实时模式' : `仍是演示模式 · ${status.reason}`);
  }

  function changeKey(value: string): void {
    setApiKey(value);
    saveApiKey(window.sessionStorage, value);
    syncChip(settings, value);
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
    ? `实时模式 · ${status.reason}`
    : wantsLive
      ? `演示模式 · 已选实时，${status.reason}`
      : `演示模式 · ${status.reason}`;
  const hint = endpointHint(settings.endpoint, settings.direct);
  const missingModel = settings.endpoint.trim().length > 0 && !settings.model.trim();

  return (
    <>
      <Toaster position="bottom-right" />
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm text-muted-foreground">
            连接、模型调用、模式与外观都存在这台设备。API key 只留在当前标签页，关掉就没了。
          </p>
        </header>

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

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">连接</h2>
          <Card>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(hint)}>
                  <FieldLabel htmlFor="set-endpoint">端点</FieldLabel>
                  <Input
                    id="set-endpoint"
                    type="url"
                    inputMode="url"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="https://api.openai.com/v1"
                    value={settings.endpoint}
                    aria-invalid={Boolean(hint)}
                    aria-describedby="set-endpoint-help"
                    onChange={(event) => update({ endpoint: event.target.value })}
                  />
                  <FieldDescription id="set-endpoint-help">
                    OpenAI 兼容的 base URL，末尾不用带 /chat/completions。
                  </FieldDescription>
                  {hint ? <FieldError>{hint}</FieldError> : null}
                </Field>

                <Field data-invalid={missingModel}>
                  <FieldLabel htmlFor="set-model">模型</FieldLabel>
                  <Input
                    id="set-model"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="gpt-4o-mini"
                    value={settings.model}
                    aria-invalid={missingModel}
                    aria-describedby="set-model-help"
                    onChange={(event) => update({ model: event.target.value })}
                  />
                  <FieldDescription id="set-model-help">
                    端点决定模型名怎么写，一般和端点文档一致。
                  </FieldDescription>
                  {missingModel ? <FieldError>端点已经填了，模型名不能空着。</FieldError> : null}
                </Field>

                <Field>
                  <FieldLabel htmlFor="set-key">API key</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="set-key"
                      type={showKey ? 'text' : 'password'}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={settings.direct ? '直连时可以空着' : 'sk-…'}
                      value={apiKey}
                      aria-describedby="set-key-help"
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
                  <FieldDescription id="set-key-help">
                    存 sessionStorage：刷新还在，关掉标签页即清除；请求时经代理内存转发，不写日志。
                  </FieldDescription>
                </Field>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="set-direct">直连端点</FieldLabel>
                    <FieldDescription>
                      浏览器直接请求，不经过代理。本机模型或允许 CORS 的端点用这个。
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="set-direct"
                    checked={settings.direct}
                    onCheckedChange={(checked) => {
                      update({ direct: checked });
                      toast.success(checked ? '已打开直连' : '已关闭直连');
                    }}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">模型调用</h2>
          <Card>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="set-output">
                    输出预算
                    <span className="font-mono text-muted-foreground">
                      {settings.maxOutputTokens} tokens
                    </span>
                  </FieldLabel>
                  <Slider
                    id="set-output"
                    min={OUTPUT_MIN}
                    max={OUTPUT_MAX}
                    step={OUTPUT_STEP}
                    value={[settings.maxOutputTokens]}
                    aria-label="输出预算"
                    onValueChange={(value) =>
                      update({ maxOutputTokens: value[0] ?? OUTPUT_DEFAULT })
                    }
                    onValueCommit={() => toast.success('输出预算已保存')}
                  />
                  <FieldDescription>
                    回复最多生成这么多 token。推理型端点会先用预算思考，太小会在正文中间截断。
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="set-context">
                    上下文窗口
                    <span className="font-mono text-muted-foreground">
                      {settings.contextMessages} 条
                    </span>
                  </FieldLabel>
                  <Slider
                    id="set-context"
                    min={CONTEXT_MIN}
                    max={CONTEXT_MAX}
                    step={1}
                    value={[settings.contextMessages]}
                    aria-label="上下文窗口"
                    onValueChange={(value) =>
                      update({ contextMessages: value[0] ?? CONTEXT_DEFAULT })
                    }
                    onValueCommit={() => toast.success('上下文窗口已保存')}
                  />
                  <FieldDescription>
                    每次请求带上最近这么多条对话；更早的留在本机。条数越多，请求越大也越贵。
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">模式</h2>
          <Card>
            <CardContent>
              <Field>
                <FieldLabel>回复来源</FieldLabel>
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
                <FieldDescription>
                  {live
                    ? '新消息发给你的端点；请求失败或返回空文本时改用本地模板，气泡标「模板回复」。'
                    : wantsLive
                      ? `已选实时，但${status.reason}。填好端点和 API key 后，新消息才会发给你的端点。`
                      : '回复来自本地模板，不发任何网络请求。填好端点并选「实时」才会调用模型。'}
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">外观</h2>
          <Card>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="set-alpha">
                    浮置面板透明度
                    <span className="font-mono text-muted-foreground">
                      {settings.panelAlpha.toFixed(2)}
                    </span>
                  </FieldLabel>
                  <Slider
                    id="set-alpha"
                    min={ALPHA_MIN}
                    max={ALPHA_MAX}
                    step={0.02}
                    value={[settings.panelAlpha]}
                    aria-label="浮置面板透明度"
                    onValueChange={(value) => update({ panelAlpha: value[0] ?? ALPHA_DEFAULT })}
                    onValueCommit={() => toast.success('透明度已保存')}
                  />
                  <FieldDescription>
                    对话面板背景的不透明度，0.4–0.9；文字始终不透明。
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>动效</FieldLabel>
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
                  <FieldDescription>关掉舞台浮尘、打字点与面板过渡的动画。</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">数据</h2>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={false}>
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

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">恢复默认设置</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>恢复默认设置？</AlertDialogTitle>
                      <AlertDialogDescription>
                        端点、模型与外观都会回到初始值，API key 不动。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={reset}>恢复</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <FieldDescription>
                三项互相独立：对话按会话存在 localStorage（最多 20 段、每段 100 条），key
                在当前标签页，设置同样在本机。
              </FieldDescription>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">关于</h2>
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <AboutRow label="版本" value="0.1.0" />
              <Separator />
              <AboutRow label="角色素材" value="CC BY-NC-SA 4.0 · 非商业演示" />
              <Separator />
              <AboutRow label="登录" value="占位页，不接后端" />
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
