import type { Emotion } from '@/lib/chat/types';

export const POSE_FILES: Readonly<Record<Emotion, string>> = {
  idle: '/character/idle.webp',
  happy: '/character/happy.webp',
  shy: '/character/shy.webp',
  sleepy: '/character/sleepy.webp',
};

export const SLICES = 28;
export const CROSSFADE_MS = 350;
export const CALM_PERIOD_MS = 6000;
export const SLEEPY_PERIOD_MS = 9000;
export const MAX_SLICE_PX = 1.5;
export const MAX_SWAY_DEG = 0.6;
export const MIN_DWELL_MS = 2000;

/** The head lags the feet by a quarter of a breath. */
const LAG = 0.25;

export function breathPeriod(emotion: Emotion): number {
  return emotion === 'sleepy' ? SLEEPY_PERIOD_MS : CALM_PERIOD_MS;
}

export function isPose(value: string | undefined): value is Emotion {
  return value !== undefined && value in POSE_FILES;
}

/**
 * Vertical offset for slice i (0 at the head) of n at time t.
 * The head moves most; the feet anchor the figure.
 */
export function sliceOffset(
  index: number,
  count: number,
  time: number,
  period: number,
  amplitude: number,
): number {
  if (count <= 1) return 0;
  const weight = index / (count - 1);
  const phase = (time / period) * Math.PI * 2 - weight * LAG * Math.PI * 2;
  return Math.sin(phase) * amplitude * (1 - 0.35 * weight);
}

export function swayAngle(time: number, period: number, maxDeg: number): number {
  return Math.sin((time / period) * Math.PI * 2) * maxDeg;
}

/** A pose holds for two seconds before the next one may start. */
export function dwellRemaining(lastChangeAt: number, now: number): number {
  if (lastChangeAt === 0) return 0;
  return Math.max(0, lastChangeAt + MIN_DWELL_MS - now);
}

export function crossfadeProgress(elapsed: number, duration = CROSSFADE_MS): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / duration));
}
