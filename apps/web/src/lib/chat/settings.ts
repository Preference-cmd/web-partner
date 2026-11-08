import { dropKey, readKey, type StringStorage, writeKey } from '../storage';
import type { ChatMode } from './types';

export type { StringStorage } from '../storage';

export const SETTINGS_KEY = 'partner.settings.v1';
export const SECRET_KEY = 'partner.secret.v1';

export const ALPHA_MIN = 0.4;
export const ALPHA_MAX = 0.9;
export const ALPHA_DEFAULT = 0.62;

export type Motion = 'system' | 'reduced' | 'full';

export interface Settings {
  endpoint: string;
  model: string;
  mode: ChatMode;
  forceDemo: boolean;
  direct: boolean;
  panelAlpha: number;
  motion: Motion;
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: '',
  model: '',
  mode: 'demo',
  forceDemo: false,
  direct: false,
  panelAlpha: ALPHA_DEFAULT,
  motion: 'system',
};

function parseAlpha(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ALPHA_DEFAULT;
  return Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, value));
}

function parseMotion(value: unknown): Motion {
  return value === 'reduced' || value === 'full' ? value : 'system';
}

export function loadSettings(storage: StringStorage | undefined): Settings {
  const raw = readKey(storage, SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const record = parsed as Record<string, unknown>;
    return {
      endpoint: typeof record.endpoint === 'string' ? record.endpoint : '',
      model: typeof record.model === 'string' ? record.model : '',
      mode: record.mode === 'live' ? 'live' : 'demo',
      forceDemo: record.forceDemo === true,
      direct: record.direct === true,
      panelAlpha: parseAlpha(record.panelAlpha),
      motion: parseMotion(record.motion),
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

/** Key lives in sessionStorage unless "remember" copied it to localStorage. */
export function readApiKey(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
): string {
  return (readKey(session, SECRET_KEY) ?? readKey(local, SECRET_KEY) ?? '').trim();
}

/** The page keeps the key in sessionStorage: closing the tab drops it. */
export function saveApiKey(session: StringStorage | undefined, key: string): void {
  const value = key.trim();
  if (!value) {
    dropKey(session, SECRET_KEY);
    return;
  }
  writeKey(session, SECRET_KEY, value);
}

export function clearApiKey(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
): void {
  dropKey(session, SECRET_KEY);
  dropKey(local, SECRET_KEY);
}

export interface ModeStatus {
  mode: ChatMode;
  reason: string;
}

/** Why the app is in this mode, in the words the settings page shows. */
export function describeMode(settings: Settings, apiKey: string): ModeStatus {
  if (settings.forceDemo) return { mode: 'demo', reason: '已强制演示' };
  if (settings.mode === 'demo') return { mode: 'demo', reason: '回复来自本地模板' };
  if (!settings.endpoint.trim()) return { mode: 'demo', reason: '还没填端点' };
  if (!apiKey && !settings.direct) return { mode: 'demo', reason: '还没填 API key' };
  return {
    mode: 'live',
    reason: settings.direct ? '直连端点，不需要 key' : '端点、key、模型已就绪',
  };
}

export function resolveMode(settings: Settings, apiKey: string): ChatMode {
  return describeMode(settings, apiKey).mode;
}

/** Advisory hint for the endpoint field; the proxy is the authority. */
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
