import type { Emotion } from '@/lib/chat/types';
import {
  breathPeriod,
  CROSSFADE_MS,
  crossfadeProgress,
  dwellRemaining,
  isPose,
  MAX_SLICE_PX,
  MAX_SWAY_DEG,
  POSE_FILES,
  SLICES,
  sliceOffset,
  swayAngle,
} from './math';

/** Every pose ships on the same 512x512 canvas, so one scale keeps them aligned. */
const IMAGE_SIZE = 512;
const MAX_DPR = 2;
/** One FPS sample a second is enough for the panel; counting every frame is not. */
const FPS_WINDOW_MS = 1000;

/** The stage either animates the canvas or holds one still frame. */
export type RendererKind = 'canvas2d' | 'static';

export interface CharacterHandle {
  dispose: () => void;
}

export interface CharacterOptions {
  renderer?: RendererKind;
}

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motion === 'reduced'
  );
}

function readEmotion(): Emotion {
  const value = document.documentElement.dataset.emotion;
  return isPose(value) ? value : 'idle';
}

function loadPose(emotion: Emotion): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`character pose failed: ${emotion}`));
    image.src = POSE_FILES[emotion];
  });
}

/**
 * Draws the four poses on a 2D canvas: sliced breathing, a slow sway around the
 * feet, and a crossfade when the chat writes a new emotion. Missing images or a
 * lost 2D context leave the stage to its aura instead of throwing.
 */
export function mountCharacter(
  canvas: HTMLCanvasElement,
  options: CharacterOptions = {},
): CharacterHandle {
  const host = canvas.parentElement ?? canvas;
  const kind: RendererKind = options.renderer ?? 'canvas2d';
  const maybeContext = canvas.getContext('2d');
  if (!maybeContext) {
    host.dataset.characterState = 'missing';
    return { dispose: () => undefined };
  }
  const context: CanvasRenderingContext2D = maybeContext;

  const images = new Map<Emotion, HTMLImageElement>();
  let ready = false;
  let disposed = false;
  let current: Emotion = readEmotion();
  let previous: Emotion | null = null;
  let pending: Emotion | null = null;
  let startedAt = 0;
  let poseChangedAt = 0;
  let dwellTimer: number | undefined;
  let frameId = 0;
  let frames = 0;
  let sampledAt = 0;
  let width = 1;
  let height = 1;
  let scale = 1;
  let reduced = prefersReducedMotion();

  // A still frame and a reduced-motion stage share the same drawing path.
  function frozen(): boolean {
    return reduced || kind === 'static';
  }

  function draw(time: number): void {
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!ready) return;

    const period = breathPeriod(current);
    const clock = frozen() ? 0 : time;
    const sway = frozen() ? 0 : swayAngle(time, period, MAX_SWAY_DEG);

    context.save();
    context.translate(width / 2, height);
    context.rotate((sway * Math.PI) / 180);
    context.translate(-width / 2, -height);

    const progress = previous ? crossfadeProgress(time - startedAt, CROSSFADE_MS) : 1;
    if (previous) drawPose(previous, 1 - progress, clock, period);
    if (progress > 0) drawPose(current, progress, clock, period);
    if (previous && progress >= 1) previous = null;

    context.restore();
  }

  function drawPose(emotion: Emotion, alpha: number, time: number, period: number): void {
    const image = images.get(emotion);
    if (!image?.naturalWidth) return;

    const side = Math.min(width, height);
    const left = (width - side) / 2;
    const top = height - side;
    const sliceHeight = side / SLICES;
    const sourceHeight = IMAGE_SIZE / SLICES;

    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (let index = 0; index < SLICES; index++) {
      const offset = frozen() ? 0 : sliceOffset(index, SLICES, time, period, MAX_SLICE_PX);
      context.drawImage(
        image,
        0,
        index * sourceHeight,
        IMAGE_SIZE,
        sourceHeight,
        left,
        top + index * sliceHeight + offset,
        side,
        sliceHeight + 0.6,
      );
    }
    context.globalAlpha = 1;
  }

  // The panel reads one sample a second from the dataset; a stopped stage has none.
  function sampleFps(timestamp: number): void {
    frames += 1;
    if (sampledAt === 0) {
      sampledAt = timestamp;
      frames = 0;
      return;
    }
    const elapsed = timestamp - sampledAt;
    if (elapsed < FPS_WINDOW_MS) return;
    host.dataset.fps = String(Math.round((frames * 1000) / elapsed));
    frames = 0;
    sampledAt = timestamp;
  }

  function loop(timestamp: number): void {
    if (disposed || frozen()) return;
    frameId = requestAnimationFrame(loop);
    draw(timestamp);
    sampleFps(timestamp);
  }

  function start(): void {
    if (disposed || frozen() || frameId !== 0) return;
    frameId = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (frameId !== 0) cancelAnimationFrame(frameId);
    frameId = 0;
    frames = 0;
    sampledAt = 0;
    delete host.dataset.fps;
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    scale = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    draw(performance.now());
  }

  function applyPose(next: Emotion): void {
    if (next === current) return;
    previous = current;
    current = next;
    startedAt = performance.now();
    poseChangedAt = startedAt;
    host.dataset.pose = next;
    if (frozen()) {
      previous = null;
      draw(startedAt);
      return;
    }
    start();
  }

  // A mood holds for two seconds so quick turns do not flash between poses.
  function setEmotion(next: Emotion): void {
    if (next === current || next === pending) return;
    const wait = dwellRemaining(poseChangedAt, performance.now());
    if (wait > 0) {
      pending = next;
      if (dwellTimer === undefined) {
        dwellTimer = window.setTimeout(() => {
          dwellTimer = undefined;
          const queued = pending;
          pending = null;
          if (queued) applyPose(queued);
        }, wait);
      }
      return;
    }
    pending = null;
    applyPose(next);
  }

  function syncMotion(): void {
    const next = prefersReducedMotion();
    if (next === reduced) return;
    reduced = next;
    if (reduced) {
      stop();
      previous = null;
      draw(performance.now());
    } else {
      start();
    }
  }

  const observer = new MutationObserver(() => {
    setEmotion(readEmotion());
    syncMotion();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-emotion', 'data-motion'],
  });

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);

  function onVisibility(): void {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibility);

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', syncMotion);

  host.dataset.renderer = kind;
  host.dataset.pose = current;
  resize();

  Promise.all((Object.keys(POSE_FILES) as Emotion[]).map((pose) => loadPose(pose)))
    .then((loaded) => {
      if (disposed) return;
      for (const [index, pose] of (Object.keys(POSE_FILES) as Emotion[]).entries()) {
        const image = loaded[index];
        if (image) images.set(pose, image);
      }
      ready = true;
      host.dataset.characterState = 'ready';
      draw(performance.now());
      start();
    })
    .catch(() => {
      if (!disposed) host.dataset.characterState = 'missing';
    });

  return {
    dispose() {
      disposed = true;
      stop();
      if (dwellTimer !== undefined) window.clearTimeout(dwellTimer);
      observer.disconnect();
      resizeObserver.disconnect();
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      delete host.dataset.characterState;
      delete host.dataset.pose;
      delete host.dataset.renderer;
      delete host.dataset.fps;
    },
  };
}
