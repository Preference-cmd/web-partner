import { describe, expect, it } from 'vitest';
import { formatSessionTime } from './session-format';

function at(year: number, month: number, day: number, hours = 9, minutes = 0): number {
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

const now = at(2026, 11, 7, 20, 30);

describe('session time', () => {
  it('shows a clock for today', () => {
    expect(formatSessionTime(at(2026, 11, 7, 14, 5), now)).toBe('14:05');
  });

  it('shows 昨天 across a month boundary', () => {
    expect(formatSessionTime(at(2026, 10, 31, 23, 59), at(2026, 11, 1, 0, 1))).toBe('昨天');
  });

  it('shows the month and day within the year', () => {
    expect(formatSessionTime(at(2026, 11, 1, 9, 0), now)).toBe('11月1日');
  });

  it('shows the year for anything older', () => {
    expect(formatSessionTime(at(2025, 12, 31, 9, 0), now)).toBe('2025年12月31日');
  });
});
