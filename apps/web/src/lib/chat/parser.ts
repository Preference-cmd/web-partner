import { judgeEmotion, matchEmotionHeader } from './emotion';
import type { Emotion } from './types';

export interface StreamParserHandlers {
  onEmotion: (emotion: Emotion) => void;
  onText: (text: string) => void;
  onMissingHeader?: () => void;
}

export interface StreamParser {
  push: (chunk: string) => void;
  flush: () => void;
}

const MAX_HEADER_CHARS = 512;

/**
 * The first line carries the emotion tag. Everything before the first newline
 * is buffered so the tag never reaches the bubble; a reply without the tag
 * falls back to local judgement on the text already received.
 */
export function createStreamParser(handlers: StreamParserHandlers): StreamParser {
  let decided = false;
  let buffer = '';
  let fenceSeen = false;

  function decide(line: string): void {
    const header = matchEmotionHeader(line);
    if (header) {
      decided = true;
      handlers.onEmotion(header.emotion);
      if (header.rest) handlers.onText(header.rest);
      return;
    }
    decided = true;
    handlers.onEmotion(judgeEmotion(line));
    handlers.onMissingHeader?.();
    if (line) handlers.onText(line);
  }

  function consumeLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!fenceSeen && trimmed.startsWith('```')) {
      fenceSeen = true;
      return;
    }
    decide(line);
  }

  function drainLines(): void {
    while (!decided) {
      const index = buffer.search(/\r?\n/u);
      if (index === -1) break;
      const line = buffer.slice(0, index);
      const skip = buffer[index] === '\r' ? 2 : 1;
      buffer = buffer.slice(index + skip);
      consumeLine(line);
    }
    if (decided && buffer) {
      handlers.onText(buffer);
      buffer = '';
    }
  }

  return {
    push(chunk) {
      if (!chunk) return;
      if (decided) {
        handlers.onText(chunk);
        return;
      }
      buffer += chunk;
      drainLines();
      if (!decided && buffer.length >= MAX_HEADER_CHARS) {
        const overflow = buffer;
        buffer = '';
        decide(overflow);
      }
    },
    flush() {
      if (decided) {
        if (buffer) {
          handlers.onText(buffer);
          buffer = '';
        }
        return;
      }
      if (buffer) {
        const line = buffer;
        buffer = '';
        decide(line);
      }
    },
  };
}
