import type { ChatMode } from './types';

export const SETTINGS_KEY = 'partner.settings.v1';
export const SECRET_KEY = 'partner.secret.v1';

export interface Settings {
  endpoint: string;
  model: string;
  mode: ChatMode;
  forceDemo: boolean;
  direct: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  endpoint: '',
  model: '',
  mode: 'demo',
  forceDemo: false,
  direct: false,
};

export interface StringStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function read(storage: StringStorage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: StringStorage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode or a full quota: the session keeps working without persistence.
  }
}

export function loadSettings(storage: StringStorage | undefined): Settings {
  const raw = read(storage, SETTINGS_KEY);
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
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StringStorage | undefined, settings: Settings): void {
  write(storage, SETTINGS_KEY, JSON.stringify(settings));
}

/** Key lives in sessionStorage unless "remember" copied it to localStorage. */
export function readApiKey(
  session: StringStorage | undefined,
  local: StringStorage | undefined,
): string {
  return (read(session, SECRET_KEY) ?? read(local, SECRET_KEY) ?? '').trim();
}

export function resolveMode(settings: Settings, apiKey: string): ChatMode {
  if (settings.forceDemo || settings.mode === 'demo') return 'demo';
  if (!settings.endpoint.trim()) return 'demo';
  // A local model reached directly often has no key.
  if (!apiKey && !settings.direct) return 'demo';
  return 'live';
}
