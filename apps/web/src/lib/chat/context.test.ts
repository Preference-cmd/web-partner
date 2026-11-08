import { describe, expect, it } from 'vitest';
import { buildModelMessages, SYSTEM_PROMPT, selectContext } from './controller';
import { estimateTokens, MAX_CONTEXT_MESSAGES, MESSAGE_OVERHEAD_TOKENS } from './llm';
import type { Message } from './types';

function message(index: number, content = 'm' + index): Message {
  return { id: 'id' + index, role: index % 2 === 0 ? 'user' : 'assistant', content, at: index };
}

function cost(messages: readonly Message[]): number {
  return messages.reduce(
    (sum, item) => sum + estimateTokens(item.content) + MESSAGE_OVERHEAD_TOKENS,
    0,
  );
}

describe('token window', () => {
  it('keeps the newest turn even when it alone exceeds the budget', () => {
    const messages = [message(0, 'x'.repeat(4000)), message(1, '在。')];
    expect(selectContext(messages, 10).map((item) => item.content)).toEqual(['在。']);
  });

  it('fills the window from the newest message backwards', () => {
    const messages = Array.from({ length: 40 }, (_, index) => message(index, '历史消息' + index));
    const window = selectContext(messages, 100);
    expect(window.at(-1)?.content).toBe('历史消息39');
    expect(cost(window)).toBeLessThanOrEqual(100);
    expect(selectContext(messages, cost(window) - 1).length).toBeLessThan(window.length);
  });

  it('caps the number of messages whatever the budget', () => {
    const messages = Array.from({ length: MAX_CONTEXT_MESSAGES + 10 }, (_, index) =>
      message(index, '嗯'),
    );
    expect(selectContext(messages, 32000)).toHaveLength(MAX_CONTEXT_MESSAGES);
  });

  it('skips empty messages', () => {
    const messages = [message(0, ''), message(1, '在。')];
    expect(selectContext(messages).map((item) => item.content)).toEqual(['在。']);
  });

  it('prepends the system prompt', () => {
    const messages = [message(0), message(1)];
    const model = buildModelMessages(messages, 4000);
    expect(model[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(model.slice(1).map((item) => item.content)).toEqual(['m0', 'm1']);
  });

  it('sends attachments as content parts', () => {
    const image = 'data:image/png;base64,AAAA';
    const note = 'data:text/plain;base64,' + Buffer.from('你好', 'utf8').toString('base64');
    const messages: Message[] = [
      {
        id: 'a',
        role: 'user',
        content: '看看',
        at: 1,
        attachments: [
          { id: 'a1', name: 'hair.png', mime: 'image/png', size: 70, dataUrl: image },
          { id: 'a2', name: 'note.txt', mime: 'text/plain', size: 6, dataUrl: note },
        ],
      },
    ];
    const user = buildModelMessages(messages, 4000)[1];
    expect(user?.role).toBe('user');
    expect(user?.content).toEqual([
      { type: 'text', text: '看看\n\n--- note.txt ---\n你好' },
      { type: 'image', image },
    ]);
  });

  it('drops a stored attachment that no longer has its data URL', () => {
    const messages: Message[] = [
      {
        id: 'a',
        role: 'user',
        content: '看看',
        at: 1,
        attachments: [{ id: 'a1', name: 'hair.png', mime: 'image/png', size: 70 }],
      },
    ];
    expect(buildModelMessages(messages, 4000)[1]?.content).toBe('看看');
  });

  it('counts an image against the window budget', () => {
    const older = message(0, '旧的');
    const newest: Message = {
      id: 'new',
      role: 'user',
      content: '看',
      at: 9,
      attachments: [
        {
          id: 'a1',
          name: 'hair.png',
          mime: 'image/png',
          size: 70,
          dataUrl: 'data:image/png;base64,AAAA',
        },
      ],
    };
    // One image costs ~1000 tokens, so only the newest fits this window.
    expect(selectContext([older, newest], 1008).map((item) => item.id)).toEqual(['new']);
    expect(selectContext([older, newest], 4000).map((item) => item.id)).toEqual([older.id, 'new']);
  });
});
