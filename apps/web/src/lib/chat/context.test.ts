import { describe, expect, it } from 'vitest';
import { buildModelMessages, SYSTEM_PROMPT, selectContext } from './controller';
import type { Message } from './types';

function message(index: number, content = 'm' + index): Message {
  return { id: 'id' + index, role: index % 2 === 0 ? 'user' : 'assistant', content, at: index };
}

describe('context window', () => {
  it('keeps the latest twenty messages by default', () => {
    const messages = Array.from({ length: 25 }, (_, index) => message(index));
    const context = selectContext(messages);
    expect(context).toHaveLength(20);
    expect(context[0]?.content).toBe('m5');
    expect(context.at(-1)?.content).toBe('m24');
  });

  it('honours a smaller or larger window', () => {
    const messages = Array.from({ length: 60 }, (_, index) => message(index));
    expect(selectContext(messages, 4).map((item) => item.content)).toEqual([
      'm56',
      'm57',
      'm58',
      'm59',
    ]);
    expect(selectContext(messages, 50)).toHaveLength(50);
  });

  it('skips empty messages', () => {
    const messages = [message(0, ''), message(1, '在。')];
    expect(selectContext(messages).map((item) => item.content)).toEqual(['在。']);
  });

  it('prepends the system prompt within the window', () => {
    const messages = Array.from({ length: 6 }, (_, index) => message(index));
    const model = buildModelMessages(messages, 4);
    expect(model).toHaveLength(5);
    expect(model[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(model.slice(1).map((item) => item.content)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });
});
