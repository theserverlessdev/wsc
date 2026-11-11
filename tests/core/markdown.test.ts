import { describe, it, expect } from 'vitest';
import { maskMarkdown, isMarkdownFile } from '../../src/core/markdown';
import { analyzeText } from '../../src/core/analyzer';

describe('isMarkdownFile', () => {
  it('recognizes markdown extensions', () => {
    expect(isMarkdownFile('README.md')).toBe(true);
    expect(isMarkdownFile('a/b/notes.markdown')).toBe(true);
    expect(isMarkdownFile('doc.MDX')).toBe(true);
    expect(isMarkdownFile('script.ts')).toBe(false);
    expect(isMarkdownFile('plain.txt')).toBe(false);
  });
});

describe('maskMarkdown', () => {
  it('preserves length and line count so offsets stay valid', () => {
    const input = '# Title\n\nHello world.\n\n```\ncode\n```\n';
    const out = maskMarkdown(input);
    expect(out.length).toBe(input.length);
    expect(out.split('\n').length).toBe(input.split('\n').length);
  });

  it('blanks fenced code blocks to spaces (whole-line construct)', () => {
    const input = 'Before.\n\n```js\nconst configuration = 1;\n```\n\nAfter.';
    const out = maskMarkdown(input);
    expect(out).not.toContain('configuration');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
    const codeLine = out.split('\n')[3];
    expect(codeLine).toBe(' '.repeat('const configuration = 1;'.length));
  });

  it('blanks inline code to the NUL sentinel (inline construct)', () => {
    const input = 'Run `npm run configuration` now.';
    const out = maskMarkdown(input);
    expect(out).not.toContain('configuration');
    expect(out).toContain('Run');
    expect(out).toContain('now.');
    // The inline span (including backticks) is replaced by NUL sentinels,
    // not spaces, so it cannot bridge the words on either side.
    const spanLength = '`npm run configuration`'.length;
    expect(out).toContain('\u0000'.repeat(spanLength));
    expect(out).not.toMatch(/ {2,}/);
  });

  it('blanks table rows entirely to spaces (whole-line construct)', () => {
    const input = '| Detector | Description |\n| --- | --- |\n| weasel | very |';
    const out = maskMarkdown(input);
    expect(out.trim()).toBe('');
    expect(out).not.toContain('\u0000');
  });

  it('blanks ATX headings entirely to spaces (whole-line construct)', () => {
    const out = maskMarkdown('## Configuration System');
    expect(out.trim()).toBe('');
    expect(out).not.toContain('\u0000');
  });

  it('blanks single-line HTML comments to the NUL sentinel (inline construct)', () => {
    const input = 'A <!-- hidden documentation --> B';
    const out = maskMarkdown(input);
    expect(out).not.toContain('documentation');
    expect(out).toContain('A ');
    expect(out).toContain('B');
    expect(out).toContain('\u0000'.repeat('<!-- hidden documentation -->'.length));
  });

  it('blanks multi-line HTML comments to spaces, preserving newlines (whole-block construct)', () => {
    const input = 'Before.\n<!--\nhidden documentation\nspanning lines\n-->\nAfter.';
    const out = maskMarkdown(input);
    expect(out).not.toContain('documentation');
    expect(out).not.toContain('\u0000');
    expect(out.split('\n').length).toBe(input.split('\n').length);
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
    // Interior lines of the comment block are blank (space-filled), so the
    // block still reads as a paragraph break, not a run-on sentence.
    expect(out.split('\n')[2]).toBe(' '.repeat('hidden documentation'.length));
  });

  it('leaves ordinary prose untouched', () => {
    const input = 'This is a normal sentence with words.';
    expect(maskMarkdown(input)).toBe(input);
  });

  it('blanks to end of input for an unterminated fence', () => {
    const out = maskMarkdown('text\n```\ncode line\nmore code');
    expect(out).toContain('text');
    expect(out).not.toContain('code line');
  });

  it('leaves an unclosed HTML comment in place (does not blank following prose)', () => {
    const input = 'Before. <!-- not closed\nThis is very clearly prose.';
    const out = maskMarkdown(input);
    expect(out).toContain('very clearly prose');
    expect(out).toContain('<!-- not closed');
  });

  it('masks many unclosed <!-- openers in under 200ms', () => {
    const input = '<!--'.repeat(25000);
    const start = performance.now();
    const out = maskMarkdown(input);
    const elapsed = performance.now() - start;
    expect(out).toBe(input);
    expect(elapsed).toBeLessThan(200);
  });

  it('does not treat a ```js``` line as a fence opener (audit #10)', () => {
    const text = ' ```js``` \nThis sentence is very clearly basically prose.';
    const result = analyzeText(text, undefined, { markdown: true });
    expect(result.issues.weaselWords.length).toBeGreaterThan(0);
    expect(text.substring(
      result.issues.weaselWords[0].index,
      result.issues.weaselWords[0].index + result.issues.weaselWords[0].length,
    ).toLowerCase()).toMatch(/very|clearly|basically/);
  });

  it('closes a fence only on the same character with length >= the opener', () => {
    const text = '````outer\n```inner\ncode basically\n```\n````\nThis is very clearly prose.';
    const result = analyzeText(text, undefined, { markdown: true });
    const weasels = result.issues.weaselWords.map(w => w.word.toLowerCase());
    expect(weasels).not.toContain('basically');
    expect(weasels).toContain('very');
  });
});

describe('inline masking does not create false adjacency', () => {
  it('does not flag duplicate words bridged by an inline code span', () => {
    const result = analyzeText('Run `npm` run build', undefined, { markdown: true });
    expect(result.issues.duplicateWords).toEqual([]);
  });

  it('does not flag passive voice bridged by an inline code span', () => {
    const result = analyzeText('The flag was `--force` deleted.', undefined, { markdown: true });
    expect(result.issues.passiveVoice).toEqual([]);
  });

  it('keeps offsets valid: a weasel word after an inline span maps to the original text', () => {
    const text = 'Use `x` very carefully.';
    const result = analyzeText(text, undefined, { markdown: true });
    const very = result.issues.weaselWords.find(w => w.word.toLowerCase() === 'very');
    expect(very).toBeDefined();
    expect(text.substring(very!.index, very!.index + very!.length)).toBe('very');
  });
});

describe('analyzeText markdown option', () => {
  it('masks fenced code blocks when markdown: true', () => {
    const text = 'Fine prose.\n```\nvery basically utilize\n```\n';
    expect(analyzeText(text, undefined, { markdown: true }).issues.weaselWords).toEqual([]);
    expect(analyzeText(text).issues.weaselWords.length).toBeGreaterThan(0);
  });
});
