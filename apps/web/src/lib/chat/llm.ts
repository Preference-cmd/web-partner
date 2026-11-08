/**
 * One source for the numbers the settings page, the client transport and the
 * Worker share. The browser sends the output budget; the Worker clamps it
 * again before it reaches an upstream endpoint. The context window is a token
 * estimate, not an exact tokenizer count: CJK costs about 1.5 characters per
 * token, ASCII about 4, and every message adds a small fixed overhead.
 */

export const TEMPERATURE = 0.7;

export const OUTPUT_MIN = 64;
export const OUTPUT_MAX = 4096;
export const OUTPUT_DEFAULT = 1024;

/** Values forwarded as `reasoning_effort`; 'off' sends no field at all. */
export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const;

export const CONTEXT_MIN = 1000;
export const CONTEXT_MAX = 32000;
export const CONTEXT_DEFAULT = 4000;

export const MESSAGE_OVERHEAD_TOKENS = 4;

/** One text part stays small enough that a full window still fits the body cap. */
export const MAX_MESSAGE_BYTES = 2 * 1024;
/** Attachments per message, and how large each kind may be. */
export const ATTACHMENT_LIMIT = 4;
export const IMAGE_BYTES_MAX = 1024 * 1024;
export const TEXT_FILE_BYTES_MAX = 64 * 1024;
/** Everything one message may carry, images included. */
export const MAX_MESSAGE_PARTS_BYTES = 1536 * 1024;
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const TEXT_FILE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
] as const;
export const MAX_ENDPOINT_CHARS = 2048;
/** Hard cap on messages from one turn, whatever the token window says. */
export const MAX_CONTEXT_MESSAGES = 200;
/** The context window plus the system line. */
export const MAX_MESSAGES = MAX_CONTEXT_MESSAGES + 1;
/** Images travel as base64 data URLs, so one turn may carry a couple of megabytes. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const CJK_CHAR = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

/** Rough token count for one message body. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (CJK_CHAR.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

export function clampOutputTokens(value: number): number {
  return Math.min(OUTPUT_MAX, Math.max(OUTPUT_MIN, Math.round(value)));
}

export function clampContextTokens(value: number): number {
  return Math.min(CONTEXT_MAX, Math.max(CONTEXT_MIN, Math.round(value)));
}
