import { describe, expect, it } from 'vitest';
import {
  breathPeriod,
  CALM_PERIOD_MS,
  CROSSFADE_MS,
  crossfadeProgress,
  dwellRemaining,
  isPose,
  MAX_SLICE_PX,
  MAX_SWAY_DEG,
  MIN_DWELL_MS,
  POSE_FILES,
  SLEEPY_PERIOD_MS,
  sliceOffset,
  swayAngle,
} from './math';

describe('pose mapping', () => {
  it('covers every emotion with a file', () => {
    expect(Object.keys(POSE_FILES).sort()).toEqual(['happy', 'idle', 'shy', 'sleepy']);
    for (const src of Object.values(POSE_FILES)) expect(src.startsWith('/character/')).toBe(true);
  });

  it('rejects unknown dataset values', () => {
    expect(isPose('happy')).toBe(true);
    expect(isPose('angry')).toBe(false);
    expect(isPose(undefined)).toBe(false);
  });
});

describe('breathing', () => {
  it('gives the feet a longer, slower breath when sleepy', () => {
    expect(breathPeriod('sleepy')).toBe(SLEEPY_PERIOD_MS);
    expect(breathPeriod('idle')).toBe(CALM_PERIOD_MS);
  });

  it('keeps every slice inside the amplitude', () => {
    for (let i = 0; i < 28; i++) {
      const offset = sliceOffset(i, 28, 1234, CALM_PERIOD_MS, MAX_SLICE_PX);
      expect(Math.abs(offset)).toBeLessThanOrEqual(MAX_SLICE_PX);
    }
  });

  it('moves the head more than the feet', () => {
    const peak = (index: number): number => {
      let max = 0;
      for (let t = 0; t <= CALM_PERIOD_MS; t += 10) {
        max = Math.max(max, Math.abs(sliceOffset(index, 28, t, CALM_PERIOD_MS, MAX_SLICE_PX)));
      }
      return max;
    };
    expect(peak(0)).toBeGreaterThan(peak(27));
  });

  it('does not divide by zero on a single slice', () => {
    expect(sliceOffset(0, 1, 0, CALM_PERIOD_MS, MAX_SLICE_PX)).toBe(0);
  });
});

describe('pose dwell', () => {
  it('lets the first pose through and holds the next for two seconds', () => {
    expect(dwellRemaining(0, 5000)).toBe(0);
    expect(dwellRemaining(1000, 2200)).toBe(MIN_DWELL_MS - 1200);
    expect(dwellRemaining(1000, 4000)).toBe(0);
  });
});

describe('sway and crossfade', () => {
  it('stays within the swing limit', () => {
    for (let t = 0; t <= CALM_PERIOD_MS; t += 137) {
      expect(Math.abs(swayAngle(t, CALM_PERIOD_MS, MAX_SWAY_DEG))).toBeLessThanOrEqual(
        MAX_SWAY_DEG,
      );
    }
  });

  it('clamps the crossfade to 0..1', () => {
    expect(crossfadeProgress(0)).toBe(0);
    expect(crossfadeProgress(CROSSFADE_MS / 2)).toBeCloseTo(0.5);
    expect(crossfadeProgress(CROSSFADE_MS * 2)).toBe(1);
    expect(crossfadeProgress(-10)).toBe(0);
  });
});
