import { describe, it, expect } from 'vitest';
import { detectHedging, detectWeaselWords } from '../../src/core/detector';

describe('flexibleSource whitespace runs (audit #2)', () => {
  it('matches a multi-space custom phrase against a single space', () => {
    expect(detectHedging('a b here', ['a    b'])).toHaveLength(1);
  });

  it('matches a single-space phrase against a run of spaces', () => {
    expect(detectHedging('a    b here', ['a b'])).toHaveLength(1);
  });

  it('still matches a hard-wrapped phrase across one newline', () => {
    expect(detectHedging('a\nb here', ['a b'])).toHaveLength(1);
  });

  it('does not match across a paragraph break', () => {
    expect(detectHedging('a\n\nb here', ['a b'])).toEqual([]);
  });

  it('keeps built-in multi-word weasel phrases matching', () => {
    const results = detectWeaselWords('There are a number of issues.');
    expect(results.map(r => r.word.toLowerCase())).toContain('are a number');
  });

  it('finishes a 4-space custom phrase against 5000 blanks in under 50ms', () => {
    const text = 'a' + ' '.repeat(5000) + 'c';
    const start = performance.now();
    const hits = detectHedging(text, ['a    b']);
    const elapsed = performance.now() - start;
    expect(hits).toEqual([]);
    expect(elapsed).toBeLessThan(50);
  });
});
