import { describe, expect, it } from 'vitest';
import type { StringStorage } from '../storage';
import {
  applyPanelPrefs,
  DEFAULT_PANEL_PREFS,
  loadPanelPrefs,
  PANEL_KEY,
  parsePanelPrefs,
  savePanelPrefs,
} from './prefs';

function memoryStorage(initial: Record<string, string> = {}): StringStorage {
  const map = new Map(Object.entries(initial));
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

describe('panel preferences', () => {
  it('falls back to a closed panel with the default light', () => {
    expect(parsePanelPrefs(null)).toEqual(DEFAULT_PANEL_PREFS);
    expect(parsePanelPrefs('not json')).toEqual(DEFAULT_PANEL_PREFS);
    expect(parsePanelPrefs('null')).toEqual(DEFAULT_PANEL_PREFS);
  });

  it('keeps a known light and renderer', () => {
    expect(parsePanelPrefs('{"open":true,"light":"dusk","renderer":"static"}')).toEqual({
      open: true,
      light: 'dusk',
      renderer: 'static',
    });
  });

  it('replaces unknown values with defaults', () => {
    expect(parsePanelPrefs('{"open":"yes","light":"noon","renderer":"webgl"}')).toEqual(
      DEFAULT_PANEL_PREFS,
    );
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    savePanelPrefs(storage, { open: true, light: 'dawn', renderer: 'static' });
    expect(loadPanelPrefs(storage)).toEqual({ open: true, light: 'dawn', renderer: 'static' });
    expect(storage.getItem(PANEL_KEY)).toContain('dawn');
  });

  it('survives storage that refuses to answer', () => {
    const storage: StringStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    expect(loadPanelPrefs(storage)).toEqual(DEFAULT_PANEL_PREFS);
    expect(() => savePanelPrefs(storage, DEFAULT_PANEL_PREFS)).not.toThrow();
  });

  it('writes the light onto the root element', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyPanelPrefs(root, { ...DEFAULT_PANEL_PREFS, light: 'deep' });
    expect(root.dataset.light).toBe('deep');
  });
});
