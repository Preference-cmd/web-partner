import { describe, expect, it } from 'vitest';
import { DEMO_POOL, pickDemoReply, QUICK_ACTIONS } from './demo';
import type { Emotion } from './types';

const EMOTIONS: readonly Emotion[] = ['idle', 'happy', 'shy', 'sleepy'];

describe('demo templates', () => {
  it('keeps at least four lines per emotion', () => {
    for (const emotion of EMOTIONS) {
      expect(DEMO_POOL[emotion].length).toBeGreaterThanOrEqual(4);
    }
  });

  it('never repeats the previous reply for the same emotion', () => {
    for (const emotion of EMOTIONS) {
      const previous = DEMO_POOL[emotion][0] ?? '';
      for (let index = 0; index < 8; index += 1) {
        const reply = pickDemoReply(emotion, previous, () => index / 8);
        expect(reply).not.toBe(previous);
        expect(DEMO_POOL[emotion]).toContain(reply);
      }
    }
  });

  it('picks a deterministic line with an injected rng', () => {
    expect(pickDemoReply('idle', undefined, () => 0)).toBe(DEMO_POOL.idle[0]);
  });

  it('offers three local quick actions', () => {
    expect(QUICK_ACTIONS).toHaveLength(3);
    for (const [label, text] of QUICK_ACTIONS) {
      expect(label.length).toBeGreaterThan(0);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
