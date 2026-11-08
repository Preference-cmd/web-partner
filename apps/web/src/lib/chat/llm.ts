/**
 * One source for the numbers the settings page, the client transport and the
 * Worker share. The browser sends the output budget; the Worker clamps it
 * again before it reaches an upstream endpoint.
 */

export const TEMPERATURE = 0.7;

export const OUTPUT_MIN = 64;
export const OUTPUT_MAX = 4096;
export const OUTPUT_STEP = 64;
export const OUTPUT_DEFAULT = 1024;

export const CONTEXT_MIN = 4;
export const CONTEXT_MAX = 50;
export const CONTEXT_DEFAULT = 20;

/** One message stays small enough that a full window still fits the body cap. */
export const MAX_MESSAGE_BYTES = 2 * 1024;
export const MAX_ENDPOINT_CHARS = 2048;
/** The context window plus the system line. */
export const MAX_MESSAGES = CONTEXT_MAX + 1;
export const MAX_BODY_BYTES = 128 * 1024;

export function clampOutputTokens(value: number): number {
  return Math.min(OUTPUT_MAX, Math.max(OUTPUT_MIN, Math.round(value)));
}

export function clampContextMessages(value: number): number {
  return Math.min(CONTEXT_MAX, Math.max(CONTEXT_MIN, Math.round(value)));
}
