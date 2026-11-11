import { describe, it, expect } from 'vitest';
import { analyzeText } from '../../src/core/analyzer';
import { DEFAULT_CONFIG } from '../../src/core/config';

const SAMPLE = 'The utilization was written very quickly done done. I think it seems like the totally wrong approach.';

describe('analyzeText', () => {
  it('runs all 8 detectors with default config', () => {
    const result = analyzeText(SAMPLE);
    expect(result.issues.weaselWords.length).toBeGreaterThan(0);
    expect(result.issues.passiveVoice.length).toBeGreaterThan(0);
    expect(result.issues.duplicateWords.length).toBeGreaterThan(0);
    expect(result.issues.nominalizations.length).toBeGreaterThan(0);
    expect(result.issues.hedging.length).toBeGreaterThan(0);
    expect(result.issues.adverbs.length).toBeGreaterThan(0);
    expect(result.summary.total).toBeGreaterThan(0);
  });

  it('disabling one detector returns empty for that detector', () => {
    const result = analyzeText(SAMPLE, { detectors: { weaselWords: { enabled: false } } });
    expect(result.issues.weaselWords).toEqual([]);
    expect(result.issues.passiveVoice.length).toBeGreaterThan(0);
  });

  it('disabling all detectors returns all empty', () => {
    const result = analyzeText(SAMPLE, {
      detectors: {
        weaselWords: { enabled: false },
        passiveVoice: { enabled: false },
        duplicateWords: { enabled: false },
        longSentences: { enabled: false },
        nominalizations: { enabled: false },
        hedging: { enabled: false },
        adverbs: { enabled: false },
        aiTells: { enabled: false },
      },
    });
    expect(result.summary.total).toBe(0);
    expect(result.issues.aiTells).toEqual([]);
  });

  it('applies weasel word add/remove overrides', () => {
    const result = analyzeText('This is very synergy driven.', {
      detectors: { weaselWords: { add: ['synergy'], remove: ['very'] } },
    });
    const words = result.issues.weaselWords.map(w => w.word.toLowerCase());
    expect(words).toContain('synergy');
    expect(words).not.toContain('very');
  });

  it('applies nominalization add/remove overrides', () => {
    const result = analyzeText('The monetization of the management plan.', {
      detectors: {
        nominalizations: {
          add: [{ word: 'monetization', suggestion: 'monetize' }],
          remove: ['management'],
        },
      },
    });
    const words = result.issues.nominalizations.map(w => w.word.toLowerCase());
    expect(words).toContain('monetization');
    expect(words).not.toContain('management');
  });

  it('applies maxWords override for long sentences', () => {
    const text = 'one two three four five six seven eight.';
    expect(analyzeText(text, { detectors: { longSentences: { maxWords: 5 } } })
      .issues.longSentences).toHaveLength(1);
    expect(analyzeText(text, { detectors: { longSentences: { maxWords: 10 } } })
      .issues.longSentences).toHaveLength(0);
  });

  it('summary.total matches sum of all issue counts', () => {
    const result = analyzeText(SAMPLE);
    const sum = result.summary.weaselWords + result.summary.passiveVoice +
      result.summary.duplicateWords + result.summary.longSentences +
      result.summary.nominalizations + result.summary.hedging + result.summary.adverbs;
    expect(result.summary.total).toBe(sum);
  });

  it('meta counts are correct', () => {
    const result = analyzeText('Hello world.');
    expect(result.meta.characterCount).toBe(12);
    expect(result.meta.wordCount).toBe(2);
    expect(result.meta.sentenceCount).toBe(1);
  });

  it('includes merged config in result', () => {
    const result = analyzeText('test', { detectors: { longSentences: { maxWords: 15 } } });
    expect((result.config.detectors.longSentences as any).maxWords).toBe(15);
    expect(result.config.detectors.weaselWords.enabled).toBe(true);
  });

  it('empty config means default behavior', () => {
    const defaultResult = analyzeText(SAMPLE);
    const emptyResult = analyzeText(SAMPLE, {});
    expect(emptyResult.summary).toEqual(defaultResult.summary);
  });

  it('empty overrides mean default behavior', () => {
    const defaultResult = analyzeText(SAMPLE);
    const emptyOverrides = analyzeText(SAMPLE, {
      detectors: { weaselWords: { add: [], remove: [] } },
    });
    expect(emptyOverrides.issues.weaselWords.length).toBe(defaultResult.issues.weaselWords.length);
  });

  it('aiTells structural patterns run by default and honor removePatterns', () => {
    const text = 'Experts agree that hydration is important.';
    const withPatterns = analyzeText(text);
    expect(withPatterns.summary.aiTells).toBe(1);

    const without = analyzeText(text, {
      detectors: { aiTells: { removePatterns: ['vague-attribution'] } },
    });
    expect(without.summary.aiTells).toBe(0);
  });

  it('sentenceCount uses the abbreviation-aware splitter', () => {
    // Naive regex splitting would count 2 sentences because of "e.g."
    const result = analyzeText('See e.g. the docs.');
    expect(result.meta.sentenceCount).toBe(1);
  });
});

describe('analyzeText options', () => {
  it('existing two-arg callers keep compiling and behaving identically', () => {
    const twoArg = analyzeText(SAMPLE, { detectors: { weaselWords: { enabled: false } } });
    const withUndefinedOptions = analyzeText(
      SAMPLE,
      { detectors: { weaselWords: { enabled: false } } },
      undefined,
    );
    expect(withUndefinedOptions).toEqual(twoArg);
  });

  it('defaults to no masking when options is omitted', () => {
    const text = '```\nvery basically utilize\n```\n';
    expect(analyzeText(text).issues.weaselWords.length).toBeGreaterThan(0);
  });

  it('markdown: false behaves the same as omitting options', () => {
    const text = '```\nvery basically utilize\n```\n';
    const withFalse = analyzeText(text, undefined, { markdown: false });
    const omitted = analyzeText(text);
    expect(withFalse).toEqual(omitted);
  });

  it('masking preserves characterCount (masking keeps length identical)', () => {
    const text = 'Prose.\n\n```\ncode block here\n```\n\nMore prose.';
    const masked = analyzeText(text, undefined, { markdown: true });
    const unmasked = analyzeText(text);
    expect(masked.meta.characterCount).toBe(unmasked.meta.characterCount);
    expect(masked.meta.characterCount).toBe(text.length);
  });

  it('wordCount does not count a masked inline span as more than one token', () => {
    const text = 'Use `a whole bunch of code words here` in prose.';
    const result = analyzeText(text, undefined, { markdown: true });
    // The inline span collapses to a single run of NUL sentinels, which
    // must count as at most one token, not one per original word.
    const withoutSpan = analyzeText('Use in prose.', undefined, { markdown: true });
    expect(result.meta.wordCount).toBeLessThanOrEqual(withoutSpan.meta.wordCount + 1);
  });

  it('does not leak the mask sentinel into aiTells text under markdown mode', () => {
    // 'not only X but also Y' is a structural AI-tell; the inline code span
    // between them masks to sentinels, which must not appear in the reported text.
    const text = 'This tool is not only `fast` but also cheap.';
    const result = analyzeText(text, undefined, { markdown: true });
    expect(result.issues.aiTells.length).toBeGreaterThan(0);
    for (const t of result.issues.aiTells) {
      expect(t.text).not.toContain('\u0000');
    }
  });
});
