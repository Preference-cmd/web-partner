'use client';

import { cn } from 'cn';
import { EyeIcon, EyeOffIcon, FlaskConicalIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  EFFORT_LABEL,
  EFFORT_ORDER,
  endpointHint,
  newModelId,
  newProviderId,
  PROVIDER_MODEL_LIMIT,
  PROVIDER_NAME_MAX,
  type Protocol,
  type Provider,
  type ProviderModel,
  providerNameFrom,
  type ReasoningEffort,
} from '@/lib/chat/settings';
import {
  type ProbeResult,
  probeReadiness,
  probeTarget,
  runProbe,
} from '@/lib/chat/test-connection';

const EFFORT_LEVELS = EFFORT_ORDER.filter((effort): effort is ReasoningEffort => effort !== 'off');

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

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface ProviderDialogProps {
  open: boolean;
  /** Null adds a provider; an entry edits it in place. */
  provider: Provider | null;
  initialKey: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Provider, apiKey: string) => void;
}

/**
 * One supplier dialog: everything a provider is, editable before it is saved.
 * "验证并保存" sends one ping with the values on screen, so a typo in the base
 * URL or the key shows up here instead of in the middle of a conversation.
 */
export default function ProviderDialog({
  open,
  provider,
  initialKey,
  onOpenChange,
  onSubmit,
}: ProviderDialogProps) {
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [direct, setDirect] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [efforts, setEfforts] = useState<ReasoningEffort[]>([]);
  const [probe, setProbe] = useState<{ running: boolean; result: ProbeResult | null }>({
    running: false,
    result: null,
  });
  const draftId = useRef(newProviderId());

  useEffect(() => {
    if (!open) return;
    if (!provider) draftId.current = newProviderId();
    setName(provider?.name ?? '');
    setProtocol(provider?.protocol ?? 'openai');
    setBaseUrl(provider?.baseUrl ?? '');
    setDirect(provider?.direct ?? false);
    setApiKey(initialKey);
    setShowKey(false);
    setModels(
      provider && provider.models.length > 0
        ? provider.models.map((model) => ({ ...model }))
        : [{ id: newModelId(), model: '' }],
    );
    setEfforts(provider?.efforts ?? []);
    setProbe({ running: false, result: null });
  }, [open, provider, initialKey]);

  // A result belongs to the values it was measured with; editing invalidates it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fields are the trigger.
  useEffect(() => {
    setProbe((current) => (current.result ? { running: false, result: null } : current));
  }, [name, protocol, baseUrl, direct, apiKey, models, efforts]);

  const trimmedUrl = baseUrl.trim();
  const hint = endpointHint(trimmedUrl, direct);
  const canSave = trimmedUrl.length > 0;

  function build(): Provider {
    const seen: string[] = [];
    const clean: ProviderModel[] = [];
    for (const model of models) {
      const value = model.model.trim().slice(0, 128);
      if (!value || seen.includes(value)) continue;
      seen.push(value);
      const label = model.label?.trim();
      clean.push({ id: model.id, model: value, ...(label ? { label } : {}) });
      if (clean.length >= PROVIDER_MODEL_LIMIT) break;
    }
    return {
      id: provider?.id ?? draftId.current,
      name: name.trim().slice(0, PROVIDER_NAME_MAX) || providerNameFrom(trimmedUrl) || '新供应商',
      protocol,
      baseUrl: trimmedUrl,
      direct,
      models: clean,
      efforts,
    };
  }

  function submit(): void {
    if (!canSave) return;
    onSubmit(build(), apiKey.trim());
  }

  async function validate(): Promise<void> {
    if (!canSave) return;
    const draft = build();
    setProbe({ running: true, result: null });
    const result = await runProbe(probeTarget(draft, draft.models[0]?.model ?? '', apiKey.trim()));
    setProbe({ running: false, result });
    if (result.outcome === 'ok') onSubmit(draft, apiKey.trim());
  }

  const draft = build();
  const blocked = probeReadiness(probeTarget(draft, draft.models[0]?.model ?? '', apiKey.trim()));
  const failed = probe.result !== null && probe.result.outcome !== 'ok';
  const primaryLabel = probe.running ? '正在验证…' : failed ? '仍然保存' : '验证并保存';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92dvh] w-[min(calc(100vw-2rem),44rem)] max-w-none flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <header className="flex flex-col gap-1 border-b px-4 py-3 pr-14 sm:px-5">
          <DialogTitle className="text-base font-semibold">
            {provider ? '编辑供应商' : '添加供应商'}
          </DialogTitle>
          <DialogDescription>都只存在这台浏览器，不会上传。</DialogDescription>
        </header>

        <div className="grid min-h-0 flex-1 gap-x-5 gap-y-4 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:px-5">
          <Field id="provider-name" label="供应商名称" hint="留空就用 base URL 的主机名。">
            <Input
              id="provider-name"
              autoComplete="off"
              maxLength={PROVIDER_NAME_MAX}
              placeholder="例如 阿里云百炼、OpenAI"
              spellCheck={false}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field id="provider-protocol" label="协议" hint="目前只接了 OpenAI 兼容。">
            <Select value={protocol} onValueChange={(value) => setProtocol(value as Protocol)}>
              <SelectTrigger id="provider-protocol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI 兼容</SelectItem>
                <SelectItem value="anthropic" disabled>
                  Anthropic Messages（未接入）
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="provider-url"
            label="base URL"
            className="sm:col-span-2"
            hint={hint ?? '以 /v1 结尾，末尾不要带 /chat/completions。'}
          >
            <Input
              id="provider-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(hint)}
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">连接方式</span>
            <ToggleGroup
              type="single"
              className="segmented"
              size="sm"
              value={direct ? 'direct' : 'proxy'}
              aria-label="连接方式"
              onValueChange={(value) => {
                if (value) setDirect(value === 'direct');
              }}
            >
              <ToggleGroupItem value="proxy" className="max-md:min-h-11">
                经代理
              </ToggleGroupItem>
              <ToggleGroupItem value="direct" className="max-md:min-h-11">
                浏览器直连
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs leading-snug text-muted-foreground">
              {direct
                ? '浏览器直接请求，端点要允许 CORS；key 可以留空。'
                : '请求经 /api/chat 转发，key 只随这一次请求走。'}
            </p>
          </div>

          <Field id="provider-key" label="API key" hint="只存在当前标签页，关掉就没了。">
            <InputGroup>
              <InputGroupInput
                id="provider-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={direct ? '可以留空' : 'sk-…'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
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
          </Field>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">模型</span>
              <span className="text-xs text-muted-foreground">
                {models.length}/{PROVIDER_MODEL_LIMIT}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {models.map((model, index) => (
                <div key={model.id} className="flex items-center gap-2">
                  <Input
                    aria-label={`模型 ${index + 1}`}
                    autoComplete="off"
                    className="flex-1"
                    placeholder="gpt-4o-mini"
                    spellCheck={false}
                    value={model.model}
                    onChange={(event) =>
                      setModels((current) =>
                        current.map((entry) =>
                          entry.id === model.id ? { ...entry, model: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    aria-label={`删除模型 ${index + 1}`}
                    className="max-md:size-11"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setModels((current) => current.filter((entry) => entry.id !== model.id))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="w-fit max-md:h-11"
              disabled={models.length >= PROVIDER_MODEL_LIMIT}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setModels((current) => [...current, { id: newModelId(), model: '' }])}
            >
              <PlusIcon data-icon="inline-start" />
              添加模型
            </Button>
            <p className="text-xs leading-snug text-muted-foreground">
              名称按供应商文档填写，输入框旁的模型菜单只列这些名字。
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium">启用的思考强度</span>
            <ToggleGroup
              type="multiple"
              size="sm"
              value={efforts}
              aria-label="启用的思考强度"
              className="segmented flex-wrap justify-start"
              onValueChange={(value) => setEfforts(value as ReasoningEffort[])}
            >
              {EFFORT_LEVELS.map((effort) => (
                <ToggleGroupItem key={effort} value={effort} className="max-md:min-h-11">
                  {EFFORT_LABEL[effort]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs leading-snug text-muted-foreground">
              勾上的档位会出现在输入区的思考强度菜单里；都不勾就只发「关」。
            </p>
          </div>
        </div>

        {/* The verdict stays outside the scroll: a failed test must be readable. */}
        {probe.result ? (
          <p
            role="status"
            className={cn('border-t px-4 py-2 text-sm sm:px-5', PROBE_TONE[probe.result.outcome])}
          >
            {PROBE_LABEL[probe.result.outcome]} · {probe.result.reason}
          </p>
        ) : null}

        <footer className="flex flex-col gap-2 border-t px-4 py-3 sm:px-5">
          {blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-11"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-11"
                disabled={!canSave || probe.running}
                onClick={submit}
              >
                直接保存
              </Button>
              <Button
                type="button"
                className="max-md:h-11"
                disabled={!canSave || probe.running || blocked !== null}
                onClick={() => {
                  if (failed) {
                    submit();
                    return;
                  }
                  void validate();
                }}
              >
                <FlaskConicalIcon data-icon="inline-start" />
                {primaryLabel}
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
