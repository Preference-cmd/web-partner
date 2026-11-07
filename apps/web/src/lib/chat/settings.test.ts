import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  readApiKey,
  resolveMode,
  SECRET_KEY,
  SETTINGS_KEY,
  type StringStorage,
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

  it('reads the key from the session first and the local copy second', () => {
    const session = memoryStorage({ [SECRET_KEY]: 'sk-session' });
    const local = memoryStorage({ [SECRET_KEY]: 'sk-local' });
    expect(readApiKey(session, local)).toBe('sk-session');
    expect(readApiKey(memoryStorage(), local)).toBe('sk-local');
    expect(readApiKey(memoryStorage(), memoryStorage())).toBe('');
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
});
