import { describe, it, expect } from 'vitest';
import { formatTextWithLineCol, formatJson, formatGitHub, formatSummary } from '../../cli/formatter';
import { analyzeText } from '../../src/core/analyzer';

const SAMPLE = 'The utilization was written very quickly.';
const CLEAN = 'The team wrote good code.';

describe('formatTextWithLineCol', () => {
  it('formats issues with file:line:col', () => {
    const result = analyzeText(SAMPLE);
    const output = formatTextWithLineCol('test.md', SAMPLE, result);
    expect(output).toContain('test.md:');
    expect(output).toContain('weasel-word');
    expect(output).toContain('"very"');
  });

  it('returns empty string for 0 issues', () => {
    const result = analyzeText(CLEAN);
    const output = formatTextWithLineCol('test.md', CLEAN, result);
    expect(output).toBe('');
  });

  it('includes nominalization suggestions', () => {
    const text = 'The utilization was high.';
    const result = analyzeText(text);
    const output = formatTextWithLineCol('test.md', text, result);
    expect(output).toContain('nominalization');
    expect(output).toContain('use');
  });

  it('includes ai-tell lines with their reason', () => {
    const text = 'We delve into the code.';
    const result = analyzeText(text);
    const output = formatTextWithLineCol('test.md', text, result);
    expect(output).toContain('ai-tell');
    expect(output).toContain('"delve"');
    expect(output).toContain('Kobak');
  });

  it('formats multiple files', () => {
    const result1 = analyzeText(SAMPLE);
    const result2 = analyzeText('I think it is totally fine.');
    const out1 = formatTextWithLineCol('a.md', SAMPLE, result1);
    const out2 = formatTextWithLineCol('b.md', 'I think it is totally fine.', result2);
    expect(out1).toContain('a.md');
    expect(out2).toContain('b.md');
  });
});

describe('formatJson', () => {
  it('produces valid JSON', () => {
    const result = analyzeText(SAMPLE);
    const output = formatJson([{ path: 'test.md', result }]);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].file).toBe('test.md');
    expect(parsed[0].summary).toBeDefined();
    expect(parsed[0].issues).toBeDefined();
  });

  it('handles multiple files', () => {
    const r1 = analyzeText(SAMPLE);
    const r2 = analyzeText(CLEAN);
    const output = formatJson([{ path: 'a.md', result: r1 }, { path: 'b.md', result: r2 }]);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
  });
});

describe('formatGitHub', () => {
  it('produces ::warning annotations', () => {
    const result = analyzeText(SAMPLE);
    const output = formatGitHub('test.md', SAMPLE, result);
    expect(output).toContain('::warning file=test.md');
    expect(output).toContain('Weasel word');
  });

  it('annotates ai-tells so gated counts match visible warnings', () => {
    const text = 'We delve into the code.';
    const output = formatGitHub('test.md', text, analyzeText(text));
    expect(output).toContain('AI tell');
    expect(output).toContain('"delve"');
  });

  it('returns empty string for 0 issues', () => {
    const result = analyzeText(CLEAN);
    const output = formatGitHub('test.md', CLEAN, result);
    expect(output).toBe('');
  });

  it('includes line and col in annotations', () => {
    const result = analyzeText(SAMPLE);
    const output = formatGitHub('test.md', SAMPLE, result);
    expect(output).toMatch(/line=\d+,col=\d+/);
  });

  it('escapes %, newlines, commas and colons in GitHub workflow commands', () => {
    const text = 'The code was\nwritten very quickly.';
    const result = analyzeText(text);
    const output = formatGitHub('path,with:colon.md', text, result);
    expect(output).toContain('file=path%2Cwith%3Acolon.md');
    expect(output).not.toMatch(/::warning file=path,with:colon/);
    const warningLines = output.split('\n').filter(l => l.startsWith('::warning'));
    expect(warningLines.length).toBeGreaterThan(0);
    expect(warningLines.some(l => l.includes('%0A'))).toBe(true);
  });
});

describe('formatTextWithLineCol — color', () => {
  it('emits ANSI colors when useColor is true and none when false', () => {
    const text = 'This is very good.';
    const result = analyzeText(text);
    const colored = formatTextWithLineCol('f.md', text, result, true);
    const plain = formatTextWithLineCol('f.md', text, result, false);
    expect(colored).toMatch(/\u001b\[/);
    expect(plain).not.toMatch(/\u001b\[/);
    expect(plain).toContain('weasel-word');
  });
});

describe('formatText (dead code removal)', () => {
  it('does not export the dead formatText function', async () => {
    const mod = await import('../../cli/formatter');
    expect((mod as Record<string, unknown>).formatText).toBeUndefined();
  });
});

describe('formatSummary', () => {
  it('reports zero issues', () => {
    expect(formatSummary(0, 1)).toContain('No issues');
  });

  it('uses singular for 1 file', () => {
    expect(formatSummary(0, 1)).toContain('1 file.');
  });

  it('uses plural for multiple files', () => {
    expect(formatSummary(5, 3)).toContain('3 files');
  });

  it('uses singular for 1 issue', () => {
    expect(formatSummary(1, 1)).toContain('1 issue');
  });

  it('uses plural for multiple issues', () => {
    expect(formatSummary(5, 1)).toContain('5 issues');
  });
});
