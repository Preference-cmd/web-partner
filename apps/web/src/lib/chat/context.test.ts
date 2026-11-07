import { describe, expect, it } from 'vitest';
import { buildModelMessages, SYSTEM_PROMPT, selectContext } from './controller';
import type { Message } from './types';

function message(index: number, content = 'm' + index): Message {
  return { id: 'id' + index, role: index % 2 === 0 ? 'user' : 'assistant', content, at: index };
}

describe('context window', () => {
  it('keeps the latest twenty messages', () => {
    const messages = Array.from({ length: 25 }, (_, index) => message(index));
    const context = selectContext(messages);
    expect(context).toHaveLength(20);
    expect(context[0]?.content).toBe('m5');
    expect(context.at(-1)?.content).toBe('m24');
  });

  it('trims the oldest messages over the character budget', () => {
    const messages = Array.from({ length: 20 }, (_, index) => message(index, 'x'.repeat(400)));
    const context = selectContext(messages);
    expect(context).toHaveLength(15);
    expect(context.at(-1)?.content).toHaveLength(400);
  });

  it('keeps the newest message even when it alone exceeds the budget', () => {
    const messages = [message(0, 'x'.repeat(7000)), message(1, 'y'.repeat(100))];
    const context = selectContext(messages);
    expect(context).toHaveLength(1);
    expect(context[0]?.content).toHaveLength(100);
  });

  it('skips empty messages', () => {
    const messages = [message(0, ''), message(1, '在。')];
    expect(selectContext(messages).map((item) => item.content)).toEqual(['在。']);
  });

  it('prepends the system prompt', () => {
    const messages = [message(0), message(1)];
    const model = buildModelMessages(messages);
    expect(model[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(model.slice(1)).toEqual([
      { role: 'user', content: 'm0' },
      { role: 'assistant', content: 'm1' },
    ]);
  });
});
