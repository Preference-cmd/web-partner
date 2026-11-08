import { dropKey, readKey, type StringStorage, writeKey } from '../storage';
import {
  CONTEXT_DEFAULT,
  clampContextTokens,
  clampOutputTokens,
  OUTPUT_DEFAULT,
  REASONING_EFFORTS,
} from './llm';
import type { ChatMode } from './types';

export type { StringStorage } from '../storage';

export const SETTINGS_KEY = 'partner.settings.v1';
/** One key per provider, written only into sessionStorage: closing the tab drops it. */
export const SECRETS_KEY = 'partner.secrets.v1';
/** The single-key file that predates providers; it answers for the migrated one. */
const LEGACY_SECRET_KEY = 'partner.secret.v1';
/** The provider a pre-provider file migrates into, so its key keeps working. */
export const LEGACY_PROVIDER_ID = 'p-legacy';

export const ALPHA_MIN = 0.4;
export const ALPHA_MAX = 0.9;
export const ALPHA_DEFAULT = 0.62;

export type Motion = 'system' | 'reduced' | 'full';

/**
 * Thinking intensity sent as `reasoning_effort`. 'off' omits the field, so a
 * model that is not a reasoning model never receives it.
 */
export type Effort = 'off' | (typeof REASONING_EFFORTS)[number];
/** What a provider can be asked for; 'off' is always available and not stored. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** The wire protocols the Worker can speak. Anything else is refused there. */
export const PROTOCOLS = ['openai'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const PROTOCOL_LABEL: Record<Protocol, string> = { openai: 'OpenAI 兼容' };

export const EFFORT_LABEL: Record<Effort, string> = {
  off: '关',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
};

/** Menu order: no field first, then what a reasoning model understands. */
export const EFFORT_ORDER: readonly Effort[] = ['off', 'minimal', 'low', 'medium', 'high'];

export const PROVIDER_LIMIT = 8;
export const PROVIDER_MODEL_LIMIT = 8;
export const PROVIDER_NAME_MAX = 32;

export interface ProviderModel {
  id: string;
  model: string;
  /** A short name the menus show instead of the model id. */
  label?: string;
}

/** One endpoint the user owns: where it is, what it speaks and which models it serves. */
export interface Provider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  direct: boolean;
  models: ProviderModel[];
  /** Reasoning levels this provider accepts; 'off' is always offered on top. */
  efforts: ReasoningEffort[];
}

/** Older files stored the effort label as this output budget. */
const LEGACY_EFFORT_TOKENS: Record<string, number> = {
  light: 512,
  standard: OUTPUT_DEFAULT,
  deep: 2048,
};

export interface Settings {
  providers: Provider[];
  activeProviderId: string;
  activeModel: string;
  mode: ChatMode;
  forceDemo: boolean;
  maxOutputTokens: number;
  contextTokens: number;
  panelAlpha: number;
  motion: Motion;
  /** Null keeps the panel content-sized; a number pins the height the user dragged. */
  panelHeight: number | null;
  effort: Effort;
  /** The reply's first sentence also lands in the stage bubble. */
  echo: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providers: [],
  activeProviderId: '',
  activeModel: '',
  mode: 'demo',
  forceDemo: false,
  maxOutputTokens: OUTPUT_DEFAULT,
  contextTokens: CONTEXT_DEFAULT,
  panelAlpha: ALPHA_DEFAULT,
  motion: 'system',
  panelHeight: null,
  effort: 'off',
  echo: true,
};

function parseAlpha(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ALPHA_DEFAULT;
  return Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, value));
}

function parseMotion(value: unknown): Motion {
  return value === 'reduced' || value === 'full' ? value : 'system';
}

/** Anything else, a legacy budget label included, means no reasoning_effort. */
function parseEffort(value: unknown): Effort {
  if (typeof value !== 'string') return 'off';
  return value === 'off' || (REASONING_EFFORTS as readonly string[]).includes(value)
    ? (value as Effort)
    : 'off';
}

function parseEfforts(value: unknown): ReasoningEffort[] {
  if (!Array.isArray(value)) return [];
  const chosen: ReasoningEffort[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!(REASONING_EFFORTS as readonly string[]).includes(item)) continue;
    const effort = item as ReasoningEffort;
    if (!chosen.includes(effort)) chosen.push(effort);
  }
  return EFFORT_ORDER.filter((effort): effort is ReasoningEffort =>
    chosen.includes(effort as ReasoningEffort),
  );
}

function clampProviderName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const name = value.trim().slice(0, PROVIDER_NAME_MAX);
  return name || fallback;
}

/** A provider needs a name the user did not type: fall back to its host. */
function hostLabel(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./u, '');
    return host.slice(0, PROVIDER_NAME_MAX);
  } catch {
    return '';
  }
}

export function providerNameFrom(baseUrl: string): string {
  return hostLabel(baseUrl);
}

function parseModels(value: unknown): ProviderModel[] {
  if (!Array.isArray(value)) return [];
  const models: ProviderModel[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const model = typeof record.model === 'string' ? record.model.trim().slice(0, 128) : '';
    if (!model || models.some((entry) => entry.model === model)) continue;
    const label =
      typeof record.label === 'string' && record.label.trim()
        ? record.label.trim().slice(0, PROVIDER_NAME_MAX)
        : undefined;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : `m-${models.length}-${model.slice(0, 8)}`;
    models.push({ id, model, ...(label ? { label } : {}) });
    if (models.length >= PROVIDER_MODEL_LIMIT) break;
  }
  return models;
}

function parseProvider(value: unknown, index: number): Provider | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim().slice(0, 2048) : '';
  const id =
    typeof record.id === 'string' && record.id.trim()
      ? record.id.trim().slice(0, 40)
      : `p-${index}`;
  const name = clampProviderName(record.name, hostLabel(baseUrl) || `供应商 ${index + 1}`);
  const protocol =
    typeof record.protocol === 'string' &&
    (PROTOCOLS as readonly string[]).includes(record.protocol)
      ? (record.protocol as Protocol)
      : 'openai';
  return {
    id,
    name,
    protocol,
    baseUrl,
    direct: record.direct === true,
    models: parseModels(record.models),
    efforts: parseEfforts(record.efforts),
  };
}

function parseProviders(value: unknown): Provider[] {
  if (!Array.isArray(value)) return [];
  const providers: Provider[] = [];
  for (const item of value) {
    const provider = parseProvider(item, providers.length);
    if (!provider || providers.some((entry) => entry.id === provider.id)) continue;
    providers.push(provider);
    if (providers.length >= PROVIDER_LIMIT) break;
  }
  return providers;
}

/**
 * An older file chose the effort as a token budget: keep that budget and drop
 * the label, which is exactly the request it used to send.
 */
function parseOutputTokens(record: Record<string, unknown>): number {
  const effort = record.effort;
  if (effort === 'light' || effort === 'standard' || effort === 'deep') {
    const presets = record.effortPresets;
    const stored =
      typeof presets === 'object' && presets !== null
        ? (presets as Record<string, unknown>)[effort]
        : undefined;
    return typeof stored === 'number' && Number.isFinite(stored)
      ? clampOutputTokens(stored)
      : (LEGACY_EFFORT_TOKENS[effort] ?? OUTPUT_DEFAULT);
  }
  const value = record.maxOutputTokens;
  return typeof value === 'number' && Number.isFinite(value)
    ? clampOutputTokens(value)
    : OUTPUT_DEFAULT;
}

function parseContextTokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampContextTokens(value)
    : CONTEXT_DEFAULT;
}

/** A pre-provider file becomes one provider that keeps sending the same request. */
function migrateProviders(record: Record<string, unknown>): Provider[] {
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim().slice(0, 2048) : '';
  const model = typeof record.model === 'string' ? record.model.trim().slice(0, 128) : '';
  const presets = parseModels(
    Array.isArray(record.modelPresets)
      ? record.modelPresets.map((item) => {
          if (typeof item !== 'object' || item === null) return null;
          const preset = item as Record<string, unknown>;
          return typeof preset.model === 'string' ? preset : null;
        })
      : [],
  );
  if (!endpoint && !model && presets.length === 0) return [];
  const models: ProviderModel[] = [];
  if (model) models.push({ id: `m-${model.slice(0, 8)}`, model });
  for (const preset of presets) {
    if (models.some((entry) => entry.model === preset.model)) continue;
    models.push(preset);
    if (models.length >= PROVIDER_MODEL_LIMIT) break;
  }
  const effort = parseEffort(record.effort);
  return [
    {
      id: LEGACY_PROVIDER_ID,
      name: hostLabel(endpoint) || '我的端点',
      protocol: 'openai',
      baseUrl: endpoint,
      direct: record.direct === true,
      models,
      efforts: effort === 'off' ? [] : [effort],
    },
  ];
}

/**
 * One active provider and model, both guaranteed to exist in the list: a stored
 * id that no longer points anywhere falls back to the first entry.
 */
function pickActive(
  providers: Provider[],
  storedProviderId: unknown,
  storedModel: unknown,
): { activeProviderId: string; activeModel: string } {
  const wantedId = typeof storedProviderId === 'string' ? storedProviderId : '';
  const provider = providers.find((entry) => entry.id === wantedId) ?? providers[0];
  if (!provider) return { activeProviderId: '', activeModel: '' };
  const wantedModel = typeof storedModel === 'string' ? storedModel : '';
  const model =
    provider.models.find((entry) => entry.model === wantedModel) ?? provider.models[0] ?? null;
  return { activeProviderId: provider.id, activeModel: model?.model ?? '' };
}

export function loadSettings(storage: StringStorage | undefined): Settings {
  const raw = readKey(storage, SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const record = parsed as Record<string, unknown>;
    const providers = Array.isArray(record.providers)
      ? parseProviders(record.providers)
      : migrateProviders(record);
    const active = pickActive(providers, record.activeProviderId, record.activeModel);
    const provider = providers.find((entry) => entry.id === active.activeProviderId);
    return {
      providers,
      ...active,
      mode: record.mode === 'live' ? 'live' : 'demo',
      forceDemo: record.forceDemo === true,
      maxOutputTokens: parseOutputTokens(record),
      contextTokens: parseContextTokens(record.contextTokens),
      panelAlpha: parseAlpha(record.panelAlpha),
      motion: parseMotion(record.motion),
      panelHeight:
        typeof record.panelHeight === 'number' && Number.isFinite(record.panelHeight)
          ? Math.round(record.panelHeight)
          : null,
      effort: clampEffort(parseEffort(record.effort), provider),
      echo: record.echo !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StringStorage | undefined, settings: Settings): void {
  writeKey(storage, SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(storage: StringStorage | undefined): void {
  dropKey(storage, SETTINGS_KEY);
}

/** The provider the composer and the request read from. */
export function activeProvider(settings: Settings): Provider | undefined {
  return settings.providers.find((provider) => provider.id === settings.activeProviderId);
}

export interface ActiveTarget {
  provider: Provider;
  model: ProviderModel;
}

/** Where the next request goes, or null when the suppliers list is empty. */
export function activeTarget(settings: Settings): ActiveTarget | null {
  const provider = activeProvider(settings);
  if (!provider) return null;
  const model =
    provider.models.find((entry) => entry.model === settings.activeModel) ?? provider.models[0];
  if (!model) return null;
  return { provider, model };
}

/** What the thinking-intensity menu may offer for one provider. */
export function effortOptions(provider: Provider | undefined): Effort[] {
  if (!provider) return ['off'];
  return EFFORT_ORDER.filter((effort) => effort === 'off' || provider.efforts.includes(effort));
}

/** A stored choice that the current provider no longer offers falls back to 'off'. */
export function clampEffort(effort: Effort, provider: Provider | undefined): Effort {
  return effortOptions(provider).includes(effort) ? effort : 'off';
}

export function modelLabel(model: ProviderModel): string {
  return model.label?.trim() || model.model;
}

/**
 * Apply a change and land on a provider and model that exist: an edit that
 * removes the current model must not leave the composer pointing at nothing.
 */
export function normalizeActive(settings: Settings): Settings {
  const provider =
    settings.providers.find((entry) => entry.id === settings.activeProviderId) ??
    settings.providers[0];
  if (!provider) {
    return { ...settings, activeProviderId: '', activeModel: '', effort: 'off' };
  }
  const model =
    provider.models.find((entry) => entry.model === settings.activeModel) ?? provider.models[0];
  return {
    ...settings,
    activeProviderId: provider.id,
    activeModel: model?.model ?? '',
    effort: clampEffort(settings.effort, provider),
  };
}

export function newProviderId(): string {
  return `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newModelId(): string {
  return `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function readSecretMap(storage: StringStorage | undefined): Record<string, string> {
  const raw = readKey(storage, SECRETS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const map: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) map[id] = value.trim();
    }
    return map;
  } catch {
    return {};
  }
}

function writeSecretMap(storage: StringStorage | undefined, map: Record<string, string>): void {
  if (Object.keys(map).length === 0) {
    dropKey(storage, SECRETS_KEY);
    return;
  }
  writeKey(storage, SECRETS_KEY, JSON.stringify(map));
}

/** The key belongs to one provider: switching providers switches the key with it. */
export function readProviderKey(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
  providerId: string,
): string {
  if (!providerId) return '';
  const fresh = readSecretMap(session)[providerId];
  if (fresh) return fresh;
  const remembered = readSecretMap(local)[providerId];
  if (remembered) return remembered;
  if (providerId === LEGACY_PROVIDER_ID) {
    return (readKey(session, LEGACY_SECRET_KEY) ?? readKey(local, LEGACY_SECRET_KEY) ?? '').trim();
  }
  return '';
}

export function saveProviderKey(
  session: StringStorage | undefined,
  providerId: string,
  key: string,
): void {
  if (!providerId) return;
  const map = readSecretMap(session);
  const value = key.trim();
  if (value) map[providerId] = value;
  else delete map[providerId];
  writeSecretMap(session, map);
  // The legacy file answered for this provider; once it has its own key, drop it.
  if (providerId === LEGACY_PROVIDER_ID && value) dropKey(session, LEGACY_SECRET_KEY);
}

export function clearProviderKey(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
  providerId: string,
): void {
  for (const storage of [session, local]) {
    const map = readSecretMap(storage);
    if (!(providerId in map)) continue;
    delete map[providerId];
    writeSecretMap(storage, map);
  }
  if (providerId === LEGACY_PROVIDER_ID) {
    dropKey(session, LEGACY_SECRET_KEY);
    dropKey(local, LEGACY_SECRET_KEY);
  }
}

export function clearAllProviderKeys(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
): void {
  for (const storage of [session, local]) {
    dropKey(storage, SECRETS_KEY);
    dropKey(storage, LEGACY_SECRET_KEY);
  }
}

/** The key the next request carries, for the provider that is currently active. */
export function currentApiKey(
  settings: Settings,
  session: StringStorage | undefined,
  local: StringStorage | undefined,
): string {
  return readProviderKey(session, local, settings.activeProviderId);
}

export interface ModeStatus {
  mode: ChatMode;
  reason: string;
}

/** Why the app is in this mode, in the words the settings page shows. */
export function describeMode(settings: Settings, apiKey: string): ModeStatus {
  if (settings.forceDemo) return { mode: 'demo', reason: '已强制演示' };
  if (settings.mode === 'demo') return { mode: 'demo', reason: '回复来自本地模板' };
  const provider = activeProvider(settings);
  if (!provider) return { mode: 'demo', reason: '还没有可用的供应商' };
  if (!provider.baseUrl.trim()) return { mode: 'demo', reason: '供应商还没填 base_url' };
  if (provider.models.length === 0) return { mode: 'demo', reason: '供应商还没加模型' };
  if (!settings.activeModel.trim()) return { mode: 'demo', reason: '还没选模型' };
  if (!apiKey && !provider.direct) return { mode: 'demo', reason: '还没填 API key' };
  return {
    mode: 'live',
    reason: provider.direct ? '直连端点，不需要 key' : '供应商、key、模型已就绪',
  };
}

export function resolveMode(settings: Settings, apiKey: string): ChatMode {
  return describeMode(settings, apiKey).mode;
}

/** Advisory hint for the base URL field; the proxy is the authority. */
export function endpointHint(endpoint: string, direct: boolean): string | null {
  const value = endpoint.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return '不是完整地址，需要带 http(s):// 前缀';
  }
  if (url.protocol === 'http:' && !direct) {
    return '代理只转发 https；本机 http 端点请打开直连';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '只支持 http(s) 端点';
  return null;
}

/** The sidebar chip is static HTML; the mode it shows is not. */
export function applyModeChip(root: ParentNode, mode: ChatMode): void {
  for (const chip of root.querySelectorAll<HTMLElement>('[data-side-mode]')) {
    chip.dataset.mode = mode;
    const text = chip.querySelector<HTMLElement>('.mode-text');
    if (text) text.textContent = mode === 'live' ? '实时模式' : '演示模式';
  }
}

/** Appearance lives on the root element so every page reads one source. */
export function applyAppearance(
  root: HTMLElement,
  settings: Pick<Settings, 'panelAlpha' | 'motion'>,
): void {
  root.style.setProperty('--panel-alpha', String(settings.panelAlpha));
  root.dataset.motion = settings.motion;
}
