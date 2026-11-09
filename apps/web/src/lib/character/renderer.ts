import type { Emotion } from '@/lib/chat/types';
import {
  ANIMATIONS,
  type AnimationName,
  CROSSFADE_MS,
  crossfadeProgress,
  dwellRemaining,
  EMOTION_ANIMATION,
  EMOTION_CUES,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  frameAt,
  isAnimation,
  isPose,
  STILL_FRAME,
  totalDuration,
} from './math';

const MAX_DPR = 2;
/** One FPS sample a second is enough for the panel; counting every frame is not. */
const FPS_WINDOW_MS = 1000;

/** The stage either plays the frame sequences or holds one still. */
export type RendererKind = 'canvas2d' | 'static';

export interface CharacterHandle {
  dispose: () => void;
}

export interface CharacterOptions {
  renderer?: RendererKind;
}

interface Playing {
  name: AnimationName;
  startedAt: number;
  /** A reaction from the stage or the chat outranks a mood's one-shot. */
  manual?: boolean;
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

function readWaiting(): boolean {
  return document.documentElement.dataset.chat === 'waiting';
}

function loadFrames(name: AnimationName): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`character frames failed: ${name}`));
    image.src = ANIMATIONS[name].file;
  });
}

/**
 * Plays the six frame strips: an idle loop, one-shot greetings and reactions,
 * and the conversation's waiting state. Reduced motion and the static renderer
 * hold one still. Missing images or a lost 2D context leave the stage to its
 * fallback instead of throwing.
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
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const images = new Map<AnimationName, HTMLImageElement>();
  let ready = false;
  let disposed = false;
  let emotion: Emotion = readEmotion();
  let waiting = readWaiting();
  let cue: Playing | null = null;
  let current: Playing | null = null;
  let transition: { name: AnimationName; frame: number; startedAt: number } | null = null;
  let poseChangedAt = 0;
  let pendingEmotion: Emotion | null = null;
  let dwellTimer: number | undefined;
  let frameId = 0;
  let frames = 0;
  let sampledAt = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let reduced = prefersReducedMotion();

  function frozen(): boolean {
    return reduced || kind === 'static';
  }

  /** Where the figure rests once no one-shot is playing. */
  function restingName(): AnimationName {
    if (frozen()) return waiting ? 'waiting' : EMOTION_ANIMATION[emotion];
    if (waiting || emotion === 'sleepy') return 'waiting';
    return 'idle';
  }

  function visibleName(): AnimationName {
    if (frozen()) return restingName();
    return cue?.name ?? restingName();
  }

  function frameFor(entry: Playing, now: number): number {
    if (frozen()) return STILL_FRAME[entry.name];
    return frameAt(ANIMATIONS[entry.name], now - entry.startedAt);
  }

  function drawCell(name: AnimationName, frame: number, alpha: number): void {
    const image = images.get(name);
    if (!image?.naturalWidth) return;
    // One cell fills the square stage by height, so the figure keeps its feet.
    const fit = Math.min(width / FRAME_WIDTH, height / FRAME_HEIGHT);
    const cellWidth = FRAME_WIDTH * fit;
    const cellHeight = FRAME_HEIGHT * fit;
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.drawImage(
      image,
      frame * FRAME_WIDTH,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      (width - cellWidth) / 2,
      height - cellHeight,
      cellWidth,
      cellHeight,
    );
    context.globalAlpha = 1;
  }

  function draw(time: number): void {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!ready || !current) return;

    const now = frozen() ? 0 : time;
    if (transition && !frozen()) {
      const progress = crossfadeProgress(now - transition.startedAt, CROSSFADE_MS);
      drawCell(transition.name, transition.frame, 1 - progress);
      drawCell(current.name, frameFor(current, now), progress);
      if (progress >= 1) transition = null;
      return;
    }
    transition = null;
    drawCell(current.name, frameFor(current, now), 1);
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

  function finishCue(now: number): void {
    if (!cue) return;
    if (now - cue.startedAt < totalDuration(ANIMATIONS[cue.name])) return;
    cue = null;
    present(now);
  }

  function loop(timestamp: number): void {
    if (disposed || frozen()) return;
    frameId = requestAnimationFrame(loop);
    finishCue(timestamp);
    draw(timestamp);
    sampleFps(timestamp);
  }

  function start(): void {
    if (disposed || frozen() || !ready || document.hidden || frameId !== 0) return;
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
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    draw(performance.now());
  }

  /** Switch to whatever should be on screen, fading out the previous frame. */
  function present(now: number, restart = false): void {
    const name = visibleName();
    if (current?.name === name && !restart) return;
    const moving = !frozen() && ready;
    transition =
      moving && current
        ? {
            name: current.name,
            frame: frameAt(ANIMATIONS[current.name], now - current.startedAt),
            startedAt: now,
          }
        : null;
    current = { name, startedAt: now };
    host.dataset.pose = name;
    draw(now);
    if (!frozen()) start();
  }

  function playCue(name: AnimationName, now = performance.now()): void {
    if (disposed || frozen()) return;
    cue = { name, startedAt: now, manual: true };
    present(now, true);
  }

  function applyEmotion(next: Emotion, now: number): void {
    if (next === emotion) return;
    emotion = next;
    poseChangedAt = now;
    const cueName = EMOTION_CUES[next];
    let restart = false;
    if (!frozen() && cueName && !cue?.manual) {
      cue = { name: cueName, startedAt: now };
      restart = true;
    } else if (!cue?.manual) {
      cue = null;
    }
    present(now, restart);
  }

  // A mood holds for two seconds so quick turns do not flash between poses.
  function setEmotion(next: Emotion): void {
    if (next === emotion || next === pendingEmotion) return;
    const wait = dwellRemaining(poseChangedAt, performance.now());
    if (wait > 0) {
      pendingEmotion = next;
      if (dwellTimer !== undefined) window.clearTimeout(dwellTimer);
      dwellTimer = window.setTimeout(() => {
        dwellTimer = undefined;
        const queued = pendingEmotion;
        pendingEmotion = null;
        if (queued) applyEmotion(queued, performance.now());
      }, wait);
      return;
    }
    if (dwellTimer !== undefined) {
      window.clearTimeout(dwellTimer);
      dwellTimer = undefined;
    }
    pendingEmotion = null;
    applyEmotion(next, performance.now());
  }

  function syncMotion(): void {
    const next = prefersReducedMotion();
    if (next === reduced) return;
    reduced = next;
    cue = null;
    transition = null;
    if (reduced) stop();
    present(performance.now(), true);
    if (!reduced) start();
  }

  const observer = new MutationObserver(() => {
    const nextWaiting = readWaiting();
    if (nextWaiting !== waiting) {
      waiting = nextWaiting;
      present(performance.now());
    }
    setEmotion(readEmotion());
    syncMotion();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-emotion', 'data-motion', 'data-chat'],
  });

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);

  function onVisibility(): void {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onTouch(): void {
    playCue('waving');
  }
  window.addEventListener('partner:touch', onTouch);

  function onCue(event: Event): void {
    const pose = (event as CustomEvent<{ pose?: string }>).detail?.pose;
    if (isAnimation(pose)) playCue(pose);
  }
  window.addEventListener('partner:character', onCue);

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', syncMotion);

  host.dataset.renderer = kind;
  host.dataset.pose = restingName();
  resize();

  const names = Object.keys(ANIMATIONS) as AnimationName[];
  Promise.all(names.map((name) => loadFrames(name)))
    .then((loaded) => {
      if (disposed) return;
      for (const [index, name] of names.entries()) {
        const image = loaded[index];
        if (image) images.set(name, image);
      }
      ready = true;
      host.dataset.characterState = 'ready';
      const now = performance.now();
      if (!frozen()) cue = { name: 'waving', startedAt: now, manual: false };
      present(now, true);
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
      window.removeEventListener('partner:touch', onTouch);
      window.removeEventListener('partner:character', onCue);
      delete host.dataset.characterState;
      delete host.dataset.pose;
      delete host.dataset.renderer;
      delete host.dataset.fps;
    },
  };
}
