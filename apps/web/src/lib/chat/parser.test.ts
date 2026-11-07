import { describe, expect, it } from 'vitest';
import { createStreamParser } from './parser';
import type { Emotion } from './types';

function collect() {
  const emotions: Emotion[] = [];
  const chunks: string[] = [];
  let missing = 0;
  const parser = createStreamParser({
    onEmotion: (emotion) => emotions.push(emotion),
    onText: (chunk) => chunks.push(chunk),
    onMissingHeader: () => {
      missing += 1;
    },
  });
  return {
    parser,
    emotions,
    text: () => chunks.join(''),
    missing: () => missing,
  };
}

describe('stream parser', () => {
  it('strips the tag and keeps the body', () => {
    const run = collect();
    run.parser.push('EMOTION: happy\n今天也很好。');
    expect(run.emotions).toEqual(['happy']);
    expect(run.text()).toBe('今天也很好。');
  });

  it('handles a chunk split inside the tag', () => {
    const run = collect();
    run.parser.push('EMOTION: hap');
    run.parser.push('py\n你好。');
    expect(run.emotions).toEqual(['happy']);
    expect(run.text()).toBe('你好。');
  });

  it('handles a tag without a newline once the stream flushes', () => {
    const run = collect();
    run.parser.push('EMOTION: sleepy 晚安。');
    run.parser.flush();
    expect(run.emotions).toEqual(['sleepy']);
    expect(run.text()).toBe('晚安。');
  });

  it('tolerates a markdown fence before the tag', () => {
    const run = collect();
    run.parser.push('\u0060\u0060\u0060\nEMOTION: shy\n嗯。');
    expect(run.emotions).toEqual(['shy']);
    expect(run.text()).toBe('嗯。');
  });

  it('drops chatter in front of the tag', () => {
    const run = collect();
    run.parser.push('好的，我明白了。EMOTION: shy\n嗯。');
    expect(run.emotions).toEqual(['shy']);
    expect(run.text()).toBe('嗯。');
  });

  it('judges locally when the tag is missing', () => {
    const run = collect();
    run.parser.push('今天好困，我先睡啦。');
    run.parser.flush();
    expect(run.emotions).toEqual(['sleepy']);
    expect(run.missing()).toBe(1);
    expect(run.text()).toBe('今天好困，我先睡啦。');
  });

  it('ignores a blank line before the tag', () => {
    const run = collect();
    run.parser.push('\nEMOTION: idle\n在呢。');
    expect(run.emotions).toEqual(['idle']);
    expect(run.text()).toBe('在呢。');
  });

  it('accepts casing and a full-width colon', () => {
    const run = collect();
    run.parser.push('EMOTION：Happy\n嘿嘿。');
    expect(run.emotions).toEqual(['happy']);
    expect(run.text()).toBe('嘿嘿。');
  });

  it('decides once a header grows past the buffer limit', () => {
    const run = collect();
    run.parser.push('啊'.repeat(600));
    expect(run.missing()).toBe(1);
    expect(run.text()).toHaveLength(600);
  });
});
