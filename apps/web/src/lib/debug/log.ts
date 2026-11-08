import { createStore } from 'zustand/vanilla';

/** Where a line came from; the panel colours each one differently. */
export type LogSource = 'user' | 'quick' | 'debug' | 'system' | 'demo' | 'model' | 'fallback';

/** The newest lines win; older ones fall off the top. */
export const LOG_LIMIT = 50;

export interface LogEntry {
  id: number;
  at: number;
  source: LogSource;
  text: string;
}

export interface LogState {
  entries: LogEntry[];
}

let nextId = 1;

export const logStore = createStore<LogState>(() => ({ entries: [] }));

/** Debug history lives in memory only: a reload starts from an empty panel. */
export function pushLog(source: LogSource, text: string, at = Date.now()): void {
  const entry: LogEntry = { id: nextId, at, source, text };
  nextId += 1;
  const entries = [...logStore.getState().entries, entry].slice(-LOG_LIMIT);
  logStore.setState({ entries });
}

export function clearLog(): void {
  logStore.setState({ entries: [] });
}
