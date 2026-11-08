import { beforeEach, describe, expect, it } from 'vitest';
import { clearLog, LOG_LIMIT, logStore, pushLog } from './log';

beforeEach(() => {
  clearLog();
});

describe('debug log', () => {
  it('starts empty', () => {
    expect(logStore.getState().entries).toEqual([]);
  });

  it('keeps the newest lines up to the limit', () => {
    for (let index = 1; index <= LOG_LIMIT + 5; index += 1) {
      pushLog('system', `line ${index}`, index);
    }
    const entries = logStore.getState().entries;
    expect(entries).toHaveLength(LOG_LIMIT);
    expect(entries[0]?.text).toBe('line 6');
    expect(entries.at(-1)?.text).toBe(`line ${LOG_LIMIT + 5}`);
    expect(entries.at(-1)?.at).toBe(LOG_LIMIT + 5);
  });

  it('numbers every line so a list key stays stable', () => {
    pushLog('user', 'a');
    pushLog('model', 'b');
    const [first, second] = logStore.getState().entries;
    expect(first?.id).not.toBe(second?.id);
  });

  it('clears without reusing the last id', () => {
    pushLog('debug', 'a');
    const before = logStore.getState().entries[0]?.id ?? 0;
    clearLog();
    pushLog('debug', 'b');
    expect(logStore.getState().entries[0]?.id).toBeGreaterThan(before);
  });
});
