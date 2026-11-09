import type { Emotion } from '@/lib/chat/types';

/** One frame sequence: a horizontal strip of equal cells. */
export type AnimationName = 'idle' | 'waving' | 'jumping' | 'failed' | 'waiting' | 'review';

export interface Animation {
  readonly file: string;
  /** How long each cell stays on screen, in milliseconds. */
  readonly durations: readonly number[];
  readonly loop: boolean;
}

/** Every strip ships 192x208 cells, so one fit keeps them aligned. */
export const FRAME_WIDTH = 192;
export const FRAME_HEIGHT = 208;
/** A state change crossfades, as the old pose renderer did. */
export const CROSSFADE_MS = 180;
/** A mood holds for two seconds before the next one may start. */
export const MIN_DWELL_MS = 2000;

/**
 * Durations follow the author's preview GIFs. `idle`, `waiting` and the doze
 * loop, so a mood that rests on one keeps breathing; the rest are one-shots
 * that hold their last cell, which is how a mood keeps its face after the
 * gesture ends.
 */
export const ANIMATIONS: Readonly<Record<AnimationName, Animation>> = {
  idle: {
    file: '/character/idle.webp',
    durations: [280, 110, 110, 140, 140, 320],
    loop: true,
  },
  waving: {
    file: '/character/waving.webp',
    durations: [140, 140, 140, 280],
    loop: false,
  },
  jumping: {
    file: '/character/jumping.webp',
    durations: [140, 140, 140, 140, 280],
    loop: false,
  },
  failed: {
    file: '/character/failed.webp',
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    loop: true,
  },
  waiting: {
    file: '/character/waiting.webp',
    durations: [150, 150, 150, 150, 150, 260],
    loop: true,
  },
  review: {
    file: '/character/review.webp',
    durations: [150, 150, 150, 450],
    loop: false,
  },
};

/**
 * The emotion decides the pose the figure holds. The jump and the review's
 * downward glance read as happy and shy once they stop on their last cell,
 * and the doze is the closest the sheet has to sleepy; a reply in flight
 * outranks all of them with the waiting loop.
 */
export const EMOTION_ANIMATION: Readonly<Record<Emotion, AnimationName>> = {
  idle: 'idle',
  happy: 'jumping',
  shy: 'review',
  sleepy: 'failed',
};

/** The still shown when motion is off: a cell that reads as its mood. */
export const STILL_FRAME: Readonly<Record<AnimationName, number>> = {
  idle: 0,
  waving: 0,
  jumping: 4,
  failed: 5,
  waiting: 0,
  review: 3,
};

export function isPose(value: string | undefined): value is Emotion {
  return value !== undefined && Object.hasOwn(EMOTION_ANIMATION, value);
}

export function isAnimation(value: string | undefined): value is AnimationName {
  return value !== undefined && Object.hasOwn(ANIMATIONS, value);
}

export function totalDuration(animation: Animation): number {
  let total = 0;
  for (const duration of animation.durations) total += duration;
  return total;
}

/**
 * The cell shown `elapsed` ms after the sequence started. A loop wraps; a
 * one-shot clamps to its last cell once the durations run out.
 */
export function frameAt(animation: Animation, elapsed: number): number {
  const count = animation.durations.length;
  if (count === 0) return 0;
  const total = totalDuration(animation);
  if (total <= 0) return 0;
  let time = Math.max(0, elapsed);
  if (animation.loop) time %= total;
  else time = Math.min(time, total - 0.001);
  let edge = 0;
  for (let index = 0; index < count; index += 1) {
    edge += animation.durations[index] ?? 0;
    if (time < edge) return index;
  }
  return count - 1;
}

/** A mood holds for two seconds before the next one may start. */
export function dwellRemaining(lastChangeAt: number, now: number): number {
  if (lastChangeAt === 0) return 0;
  return Math.max(0, lastChangeAt + MIN_DWELL_MS - now);
}

export function crossfadeProgress(elapsed: number, duration = CROSSFADE_MS): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / duration));
}
