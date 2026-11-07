import type { Emotion } from './types';

export const DEMO_POOL: Readonly<Record<Emotion, readonly string[]>> = {
  idle: [
    '我在呢。你想聊点什么？',
    '今天也辛苦了。要不要先靠一会儿？',
    '嗯，我听着。慢慢说就好。',
    '窗外很安静，正好适合说说话。',
    '如果还没想好说什么，我们先发会儿呆也行。',
  ],
  happy: [
    '听你这么说，我也跟着开心起来了。',
    '嘿嘿，那今天我们心情都不错。',
    '这样就好，我很喜欢看到你笑。',
    '太好了，值得记下来的一天。',
  ],
  shy: [
    '别、别这么夸我啦，会不好意思的。',
    '你这样说，我都不知道往哪看了。',
    '唔…只有一点点高兴，真的只有一点点。',
    '再这样的话，我要躲到泡泡后面去了。',
  ],
  sleepy: [
    '那就把灯调暗一点，我陪你眯一会儿。',
    '困了就睡吧，我在这儿守着。',
    '晚安。做个短短的、暖暖的梦。',
    '呼…我也有一点困了，一起打个哈欠吧。',
  ],
};

export const GREETING = '我在。今天想聊点什么？';

export const QUICK_ACTIONS: ReadonlyArray<readonly [string, string]> = [
  ['摸摸头', '摸摸头'],
  ['陪我待会儿', '陪我待会儿'],
  ['夸夸我', '夸夸我'],
];

/** Picks a template without repeating the previous reply. */
export function pickDemoReply(
  emotion: Emotion,
  exclude?: string,
  rng: () => number = Math.random,
): string {
  const pool = DEMO_POOL[emotion];
  const candidates = pool.filter((line) => line !== exclude);
  if (candidates.length === 0) return pool[0] ?? '';
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index] ?? '';
}
