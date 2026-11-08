import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MAX,
  CONTEXT_MIN,
  clampContextTokens,
  clampOutputTokens,
  estimateTokens,
  OUTPUT_MAX,
  OUTPUT_MIN,
} from './llm';

describe('llm parameters', () => {
  it('estimates CJK closer than ASCII', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('你好')).toBe(2);
    expect(estimateTokens('hello world')).toBe(3);
  });

  it('clamps the two budgets to their ranges', () => {
    expect(clampOutputTokens(1)).toBe(OUTPUT_MIN);
    expect(clampOutputTokens(99999)).toBe(OUTPUT_MAX);
    expect(clampOutputTokens(1024.4)).toBe(1024);
    expect(clampContextTokens(1)).toBe(CONTEXT_MIN);
    expect(clampContextTokens(99999)).toBe(CONTEXT_MAX);
    expect(clampContextTokens(4000.6)).toBe(4001);
  });
});
