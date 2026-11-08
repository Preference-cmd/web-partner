import { describe, expect, it } from 'vitest';
import {
  CONTEXT_DEFAULT,
  CONTEXT_MAX,
  CONTEXT_MIN,
  OUTPUT_DEFAULT,
  OUTPUT_MAX,
  OUTPUT_MIN,
} from './llm';
import {
  ALPHA_DEFAULT,
  ALPHA_MAX,
  ALPHA_MIN,
  applyAppearance,
  clearApiKey,
  clearSettings,
  DEFAULT_SETTINGS,
  describeMode,
  endpointHint,
  loadSettings,
  readApiKey,
  resolveMode,
  SECRET_KEY,
  SETTINGS_KEY,
  type StringStorage,
  saveApiKey,
  saveSettings,
} from './settings';

function memoryStorage(seed: Record<string, string> = {}): StringStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('settings', () => {
  it('falls back to defaults without storage', () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a corrupt record', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips the saved settings', () => {
    const storage = memoryStorage();
    const settings = {
      ...DEFAULT_SETTINGS,
      endpoint: 'https://api.example.com/v1',
      model: 'demo-model',
      mode: 'live' as const,
      direct: true,
    };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('keeps a stored alpha inside the slider range', () => {
    const store = (panelAlpha: unknown) =>
      loadSettings(
        memoryStorage({
          [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, panelAlpha }),
        }),
      ).panelAlpha;
    expect(store(ALPHA_DEFAULT)).toBe(ALPHA_DEFAULT);
    expect(store(0.1)).toBe(ALPHA_MIN);
    expect(store(1.4)).toBe(ALPHA_MAX);
    expect(store('0.5')).toBe(ALPHA_DEFAULT);
    expect(store(undefined)).toBe(ALPHA_DEFAULT);
  });

  it('clamps the model-call numbers', () => {
    const stored = (patch: Record<string, unknown>) =>
      loadSettings(
        memoryStorage({
          [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, ...patch }),
        }),
      );
    expect(stored({ maxOutputTokens: 2048 }).maxOutputTokens).toBe(2048);
    expect(stored({ maxOutputTokens: 1 }).maxOutputTokens).toBe(OUTPUT_MIN);
    expect(stored({ maxOutputTokens: 99999 }).maxOutputTokens).toBe(OUTPUT_MAX);
    expect(stored({ maxOutputTokens: 'big' }).maxOutputTokens).toBe(OUTPUT_DEFAULT);
    expect(stored({ contextMessages: 30 }).contextMessages).toBe(30);
    expect(stored({ contextMessages: 0 }).contextMessages).toBe(CONTEXT_MIN);
    expect(stored({ contextMessages: 99 }).contextMessages).toBe(CONTEXT_MAX);
    expect(stored({ contextMessages: null }).contextMessages).toBe(CONTEXT_DEFAULT);
  });

  it('only accepts a known motion value', () => {
    const store = (motion: unknown) =>
      loadSettings(
        memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, motion }) }),
      ).motion;
    expect(store('reduced')).toBe('reduced');
    expect(store('full')).toBe('full');
    expect(store('system')).toBe('system');
    expect(store('sometimes')).toBe('system');
  });

  it('fills the model-call defaults into an older record', () => {
    const older = {
      endpoint: 'https://api.example.com/v1',
      model: 'demo-model',
      mode: 'live',
      forceDemo: false,
      direct: false,
      panelAlpha: 0.7,
      motion: 'reduced',
    };
    const loaded = loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify(older) }));
    expect(loaded.maxOutputTokens).toBe(OUTPUT_DEFAULT);
    expect(loaded.contextMessages).toBe(CONTEXT_DEFAULT);
    expect(loaded.panelAlpha).toBe(0.7);
  });

  it('clears the settings record', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{}' });
    clearSettings(storage);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads the key from the session first and the local copy second', () => {
    const session = memoryStorage({ [SECRET_KEY]: 'sk-session' });
    const local = memoryStorage({ [SECRET_KEY]: 'sk-local' });
    expect(readApiKey(session, local)).toBe('sk-session');
    expect(readApiKey(memoryStorage(), local)).toBe('sk-local');
    expect(readApiKey(memoryStorage(), memoryStorage())).toBe('');
  });

  it('writes the key to the session and drops it when blank', () => {
    const session = memoryStorage();
    saveApiKey(session, '  sk-new  ');
    expect(readApiKey(session, memoryStorage())).toBe('sk-new');
    saveApiKey(session, '   ');
    expect(readApiKey(session, memoryStorage())).toBe('');
  });

  it('clears both copies of the key', () => {
    const session = memoryStorage({ [SECRET_KEY]: 'sk-session' });
    const local = memoryStorage({ [SECRET_KEY]: 'sk-local' });
    clearApiKey(session, local);
    expect(readApiKey(session, local)).toBe('');
  });

  it('resolves the effective mode', () => {
    const demo = { ...DEFAULT_SETTINGS };
    const live = {
      ...DEFAULT_SETTINGS,
      mode: 'live' as const,
      endpoint: 'https://api.example.com/v1',
    };
    expect(resolveMode(demo, 'sk-test')).toBe('demo');
    expect(resolveMode({ ...live, forceDemo: true }, 'sk-test')).toBe('demo');
    expect(resolveMode(live, '')).toBe('demo');
    expect(resolveMode(live, 'sk-test')).toBe('live');
    expect(resolveMode({ ...live, direct: true }, '')).toBe('live');
  });

  it('explains why the mode is not live', () => {
    const live = {
      ...DEFAULT_SETTINGS,
      mode: 'live' as const,
      endpoint: 'https://api.example.com/v1',
    };
    expect(describeMode(live, 'sk-test')).toEqual({
      mode: 'live',
      reason: '端点、key、模型已就绪',
    });
    expect(describeMode({ ...live, direct: true }, '')).toEqual({
      mode: 'live',
      reason: '直连端点，不需要 key',
    });
    expect(describeMode({ ...live, forceDemo: true }, 'sk-test').reason).toBe('已强制演示');
    expect(describeMode(DEFAULT_SETTINGS, 'sk-test').reason).toBe('回复来自本地模板');
    expect(describeMode({ ...live, endpoint: '  ' }, 'sk-test').reason).toBe('还没填端点');
    expect(describeMode(live, '').reason).toBe('还没填 API key');
  });

  it('hints on an endpoint the proxy would reject', () => {
    expect(endpointHint('', false)).toBeNull();
    expect(endpointHint('https://api.example.com/v1', false)).toBeNull();
    expect(endpointHint('http://127.0.0.1:11434/v1', true)).toBeNull();
    expect(endpointHint('api.example.com/v1', false)).toContain('http(s)://');
    expect(endpointHint('http://127.0.0.1:11434/v1', false)).toContain('直连');
    expect(endpointHint('ftp://api.example.com/v1', false)).toContain('http(s)');
  });

  it('applies appearance to the root element', () => {
    const properties: Record<string, string> = {};
    const root = {
      style: {
        setProperty: (name: string, value: string) => {
          properties[name] = value;
        },
      },
      dataset: {} as Record<string, string>,
    };
    applyAppearance(root as unknown as HTMLElement, { panelAlpha: 0.75, motion: 'reduced' });
    expect(properties['--panel-alpha']).toBe('0.75');
    expect(root.dataset.motion).toBe('reduced');
  });
});
