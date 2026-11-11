import { describe, it, expect } from 'vitest';
import {
  detectWeaselWords,
  detectHedging,
  detectAdverbs,
  detectNominalizations,
  detectAiTells,
} from '../../src/core/detector';
import { analyzeText } from '../../src/core/analyzer';

const HANG_MS = 1000;

describe('empty config add entries do not hang detectors (audit #1)', () => {
  it('detectWeaselWords ignores empty and whitespace-only custom words', { timeout: HANG_MS }, () => {
    expect(detectWeaselWords('hello world', ['', '   '])).toEqual([]);
    const hits = detectWeaselWords('this is very good', ['', 'very']);
    expect(hits.map(h => h.word.toLowerCase())).toEqual(['very']);
  });

  it('detectHedging ignores empty and whitespace-only custom phrases', { timeout: HANG_MS }, () => {
    expect(detectHedging('hello world', ['', '  '])).toEqual([]);
    const hits = detectHedging('in my view this is fine', ['', 'in my view']);
    expect(hits).toHaveLength(1);
  });

  it('detectAdverbs ignores empty and whitespace-only custom words', { timeout: HANG_MS }, () => {
    expect(detectAdverbs('hello world', ['', '\t'])).toEqual([]);
    const hits = detectAdverbs('totally fine', ['', 'totally']);
    expect(hits).toHaveLength(1);
  });

  it('detectNominalizations ignores empty custom words', { timeout: HANG_MS }, () => {
    expect(detectNominalizations('hello world', [{ word: '', suggestion: 'x' }])).toEqual([]);
    const hits = detectNominalizations('the utilization is high', [
      { word: '', suggestion: 'x' },
      { word: 'utilization', suggestion: 'use' },
    ]);
    expect(hits).toHaveLength(1);
  });

  it('detectAiTells ignores empty vocabulary, variants, and phrases', { timeout: HANG_MS }, () => {
    expect(detectAiTells(
      'hello world',
      [{ word: '', reason: 'empty' }],
      [{ phrase: '', reason: 'empty' }],
      [],
    )).toEqual([]);
    const hits = detectAiTells(
      'we should delve into it',
      [{ word: '', variants: [''], reason: 'empty' }, { word: 'delve', reason: 'vocab' }],
      [{ phrase: '  ', reason: 'empty' }],
      [],
    );
    expect(hits.some(h => h.text.toLowerCase() === 'delve')).toBe(true);
  });

  it('analyzeText does not hang when a config add list contains ""', { timeout: HANG_MS }, () => {
    const result = analyzeText('hello world', {
      detectors: {
        weaselWords: { add: [''] },
        hedging: { add: [''] },
        adverbs: { add: [''] },
        aiTells: { add: [''], addPhrases: [''] },
      },
    });
    expect(result.summary.total).toBeGreaterThanOrEqual(0);
  });
});
