import type { RendererKind } from '../character/renderer';
import { readKey, type StringStorage, writeKey } from '../storage';

export const PANEL_KEY = 'partner.panel.v1';

/** Four stage lights; every one stays inside the dark theme. */
export type LightTheme = 'night' | 'dusk' | 'deep' | 'dawn';

export interface PanelPrefs {
  open: boolean;
  light: LightTheme;
  renderer: RendererKind;
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  open: false,
  light: 'night',
  renderer: 'canvas2d',
};

const LIGHTS: ReadonlyArray<LightTheme> = ['night', 'dusk', 'deep', 'dawn'];
const RENDERERS: ReadonlyArray<RendererKind> = ['canvas2d', 'static'];

function isLight(value: unknown): value is LightTheme {
  return typeof value === 'string' && (LIGHTS as ReadonlyArray<string>).includes(value);
}

function isRenderer(value: unknown): value is RendererKind {
  return typeof value === 'string' && (RENDERERS as ReadonlyArray<string>).includes(value);
}

export function parsePanelPrefs(raw: string | null): PanelPrefs {
  if (!raw) return { ...DEFAULT_PANEL_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PANEL_PREFS };
    const record = parsed as Record<string, unknown>;
    return {
      open: record.open === true,
      light: isLight(record.light) ? record.light : DEFAULT_PANEL_PREFS.light,
      renderer: isRenderer(record.renderer) ? record.renderer : DEFAULT_PANEL_PREFS.renderer,
    };
  } catch {
    return { ...DEFAULT_PANEL_PREFS };
  }
}

export function loadPanelPrefs(storage: StringStorage | undefined): PanelPrefs {
  return parsePanelPrefs(readKey(storage, PANEL_KEY));
}

export function savePanelPrefs(storage: StringStorage | undefined, prefs: PanelPrefs): void {
  writeKey(storage, PANEL_KEY, JSON.stringify(prefs));
}

/** The stage reads the light from the root element, so CSS owns the palette. */
export function applyPanelPrefs(root: HTMLElement, prefs: PanelPrefs): void {
  root.dataset.light = prefs.light;
}
