import { describe, it, expect } from 'vitest';
import { makeLineIndex } from '../../src/core/linecol';

function oldGetLineCol(text: string, index: number) {
  const lines = text.substring(0, index).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

describe('makeLineIndex (audit #4)', () => {
  const samples = [
    '',
    'hello',
    'hello world',
    'line1\nline2\nline3',
    'foo\r\nbar\r\nbaz',
    'trailing\n',
    '\nleading',
    'a\n\nb',
    'very\n'.repeat(20),
  ];

  it('matches the previous substring-split implementation on CRLF, multi-line, and edge indexes', () => {
    for (const text of samples) {
      const locate = makeLineIndex(text);
      const indexes = [0, text.length, Math.floor(text.length / 2)];
      if (text.length > 0) indexes.push(1, text.length - 1);
      for (const index of indexes) {
        expect(locate(index), `${JSON.stringify(text)} @ ${index}`).toEqual(oldGetLineCol(text, index));
      }
    }
  });

  it('returns line 1, column 1 for index 0', () => {
    expect(makeLineIndex('hello')(0)).toEqual({ line: 1, column: 1 });
    expect(makeLineIndex('')(0)).toEqual({ line: 1, column: 1 });
  });

  it('treats a negative index like substring(0, negative) (empty prefix)', () => {
    expect(makeLineIndex('hello')(-1)).toEqual(oldGetLineCol('hello', -1));
  });

  it('locates 20k line starts in under 200ms', () => {
    const text = 'very\n'.repeat(20000);
    const locate = makeLineIndex(text);
    const indexes: number[] = [];
    for (let i = 0; i < text.length; i += 5) indexes.push(i);
    const start = performance.now();
    for (const index of indexes) locate(index);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
