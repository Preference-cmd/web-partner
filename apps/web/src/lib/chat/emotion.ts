import type { Emotion } from './types';

/** One label per mood, shared by the chat header, the panel and the log. */
export const EMOTION_LABEL: Readonly<Record<Emotion, string>> = {
  idle: '平静',
  happy: '开心',
  shy: '害羞',
  sleepy: '困了',
};

const SIGNALS: ReadonlyArray<readonly [Emotion, RegExp]> = [
  ['shy', /害羞|脸红|不好意思|羞|别夸|讨厌啦|摸摸|抱抱/u],
  ['sleepy', /困|睡|累|晚安|眯|休息|熬夜|深夜|哈欠/u],
  ['happy', /开心|高兴|喜欢|太好了|哈哈|笑|棒|可爱|爱你|谢谢|夸/u],
];

const HEADER = /EMOTION\s*[:：]?\s*(idle|happy|shy|sleepy)\b/iu;

export function judgeEmotion(text: string): Emotion {
  for (const [emotion, pattern] of SIGNALS) {
    if (pattern.test(text)) return emotion;
  }
  return 'idle';
}

export interface EmotionHeader {
  emotion: Emotion;
  rest: string;
}

/**
 * Finds the first-line emotion tag, tolerating a markdown fence or chatter in
 * front of it. Anything before the tag is dropped with the tag itself.
 */
export function matchEmotionHeader(line: string): EmotionHeader | null {
  const match = HEADER.exec(line);
  if (!match) return null;
  const emotion = match[1]?.toLowerCase();
  if (!emotion) return null;
  const rest = line
    .slice((match.index ?? 0) + match[0].length)
    .replace(/^[\s,，。.!！:：`*]+/u, '');
  return { emotion: emotion as Emotion, rest };
}
