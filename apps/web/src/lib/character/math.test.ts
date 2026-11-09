import { describe, expect, it } from 'vitest';
import {
  ANIMATIONS,
  type AnimationName,
  CROSSFADE_MS,
  crossfadeProgress,
  dwellRemaining,
  EMOTION_ANIMATION,
  EMOTION_CUES,
  frameAt,
  isAnimation,
  isPose,
  MIN_DWELL_MS,
  STILL_FRAME,
  totalDuration,
} from './math';

const NAMES = Object.keys(ANIMATIONS) as AnimationName[];

describe('frame strips', () => {
  it('maps every emotion to a strip and every cue to a one-shot', () => {
    expect(Object.keys(EMOTION_ANIMATION).sort()).toEqual(['happy', 'idle', 'shy', 'sleepy']);
    for (const name of Object.values(EMOTION_ANIMATION)) expect(ANIMATIONS[name]).toBeDefined();
    expect(EMOTION_CUES.happy).toBe('jumping');
    expect(EMOTION_CUES.shy).toBe('review');
    expect(ANIMATIONS.idle.loop).toBe(true);
    expect(ANIMATIONS.waiting.loop).toBe(true);
    expect(ANIMATIONS.jumping.loop).toBe(false);
    expect(ANIMATIONS.failed.loop).toBe(false);
  });

  it('points every strip at a character file and gives every frame a duration', () => {
    for (const name of NAMES) {
      const animation = ANIMATIONS[name];
      expect(animation.file.startsWith('/character/')).toBe(true);
      expect(animation.durations.length).toBeGreaterThan(0);
      for (const duration of animation.durations) expect(duration).toBeGreaterThan(0);
    }
  });

  it('keeps the published idle timing', () => {
    expect(totalDuration(ANIMATIONS.idle)).toBe(1100);
    expect(ANIMATIONS.idle.durations).toEqual([280, 110, 110, 140, 140, 320]);
  });

  it('has a still frame inside every strip', () => {
    for (const name of NAMES) {
      expect(STILL_FRAME[name]).toBeGreaterThanOrEqual(0);
      expect(STILL_FRAME[name]).toBeLessThan(ANIMATIONS[name].durations.length);
    }
  });
});

describe('frame selection', () => {
  const idle = ANIMATIONS.idle;

  it('walks the durations in order', () => {
    expect(frameAt(idle, 0)).toBe(0);
    expect(frameAt(idle, 279)).toBe(0);
    expect(frameAt(idle, 280)).toBe(1);
    expect(frameAt(idle, 389)).toBe(1);
    expect(frameAt(idle, 390)).toBe(2);
  });

  it('wraps a loop and clamps a one-shot', () => {
    expect(frameAt(idle, 1100)).toBe(0);
    expect(frameAt(idle, 1100 + 280)).toBe(1);
    expect(frameAt(idle, -50)).toBe(0);
    const jump = ANIMATIONS.jumping;
    expect(frameAt(jump, 0)).toBe(0);
    expect(frameAt(jump, totalDuration(jump) - 1)).toBe(jump.durations.length - 1);
    expect(frameAt(jump, totalDuration(jump) * 5)).toBe(jump.durations.length - 1);
  });

  it('does not divide by zero on an empty or zero-length strip', () => {
    expect(frameAt({ file: '', durations: [], loop: true }, 10)).toBe(0);
    expect(frameAt({ file: '', durations: [0], loop: true }, 10)).toBe(0);
  });
});

describe('state values', () => {
  it('rejects unknown dataset values', () => {
    expect(isPose('happy')).toBe(true);
    expect(isPose('angry')).toBe(false);
    expect(isPose(undefined)).toBe(false);
    expect(isPose('constructor')).toBe(false);
    expect(isAnimation('waving')).toBe(true);
    expect(isAnimation('running')).toBe(false);
    expect(isAnimation('toString')).toBe(false);
    expect(isAnimation(undefined)).toBe(false);
  });
});

describe('pose dwell', () => {
  it('lets the first pose through and holds the next for two seconds', () => {
    expect(dwellRemaining(0, 5000)).toBe(0);
    expect(dwellRemaining(1000, 2200)).toBe(MIN_DWELL_MS - 1200);
    expect(dwellRemaining(1000, 4000)).toBe(0);
  });
});

describe('crossfade', () => {
  it('clamps the fade to 0..1', () => {
    expect(CROSSFADE_MS).toBeGreaterThan(0);
    expect(crossfadeProgress(0)).toBe(0);
    expect(crossfadeProgress(CROSSFADE_MS / 2)).toBeCloseTo(0.5);
    expect(crossfadeProgress(CROSSFADE_MS * 2)).toBe(1);
    expect(crossfadeProgress(-10)).toBe(0);
  });
});
