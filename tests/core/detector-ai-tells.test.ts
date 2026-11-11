import { describe, it, expect } from 'vitest';
import { detectAiTells } from '../../src/core/detector';
import { aiTellsVocabulary, aiTellsPhrases, aiTellsPatterns } from '../../src/core/words';

describe('detectAiTells', () => {
  it('returns empty for empty string', () => {
    expect(detectAiTells('')).toEqual([]);
  });

  it('returns empty for clean text', () => {
    expect(detectAiTells('The system works well and is fast.')).toEqual([]);
  });

  it('detects a vocabulary tell', () => {
    const results = detectAiTells('We need to delve into this problem.');
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('delve');
    expect(results[0].reason).toContain('delve');
  });

  it('detects multiple vocabulary tells', () => {
    const results = detectAiTells('This comprehensive and pivotal approach is transformative.');
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('is case-insensitive for vocabulary', () => {
    const results = detectAiTells('DELVE into it.');
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('DELVE');
  });

  it('matches whole words only for vocabulary', () => {
    // "realm" should not match inside "unrealm" or similar
    expect(detectAiTells('The unrealm is vast.')).toEqual([]);
  });

  it('detects phrase tells', () => {
    const results = detectAiTells("It's important to note that this matters.");
    expect(results).toHaveLength(1);
    expect(results[0].reason).toContain('hedging');
  });

  it('detects phrase tells case-insensitively', () => {
    const results = detectAiTells("IN TODAY'S FAST-PACED WORLD, we must adapt.");
    expect(results).toHaveLength(1);
  });

  it('returns correct index and length for vocabulary', () => {
    const text = 'We should delve deeper.';
    const results = detectAiTells(text);
    expect(results).toHaveLength(1);
    expect(text.substring(results[0].index, results[0].index + results[0].length)).toBe('delve');
  });

  it('returns correct index and length for phrases', () => {
    const text = "Yes, let's dive in to the topic.";
    const results = detectAiTells(text);
    expect(results).toHaveLength(1);
    expect(text.substring(results[0].index, results[0].index + results[0].length)).toBe("let's dive in");
  });

  it('accepts custom vocabulary list', () => {
    const customVocab = [{ word: 'synergy', reason: 'Custom AI tell' }];
    const results = detectAiTells('We need more synergy.', customVocab, []);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('synergy');
  });

  it('accepts custom phrase list', () => {
    const customPhrases = [{ phrase: 'circle back', reason: 'Corporate AI tell' }];
    const results = detectAiTells("Let's circle back on this.", [], customPhrases);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('circle back');
  });

  it('returns results sorted by position', () => {
    const text = 'This pivotal and comprehensive approach leveraging new paradigms.';
    const results = detectAiTells(text);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].index).toBeGreaterThanOrEqual(results[i - 1].index);
    }
  });

  it('default vocabulary list has expected entries', () => {
    expect(aiTellsVocabulary.length).toBeGreaterThan(30);
    expect(aiTellsVocabulary.some(v => v.word === 'delve')).toBe(true);
    expect(aiTellsVocabulary.some(v => v.word === 'tapestry')).toBe(true);
  });

  it('default phrase list has expected entries', () => {
    expect(aiTellsPhrases.length).toBeGreaterThan(20);
    expect(aiTellsPhrases.some(p => p.phrase === "let's dive in")).toBe(true);
    expect(aiTellsPhrases.some(p => p.phrase === 'great question')).toBe(true);
  });

  it('each vocabulary entry has word and reason', () => {
    for (const entry of aiTellsVocabulary) {
      expect(typeof entry.word).toBe('string');
      expect(entry.word.length).toBeGreaterThan(0);
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('each phrase entry has phrase and reason', () => {
    for (const entry of aiTellsPhrases) {
      expect(typeof entry.phrase).toBe('string');
      expect(entry.phrase.length).toBeGreaterThan(0);
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  // ── Inflected variants ──

  it('matches inflected variants of vocabulary words', () => {
    expect(detectAiTells('The paper delves into the topic.').length).toBe(1);
    expect(detectAiTells('We spent a week delving into logs.').length).toBe(1);
    expect(detectAiTells('She showcased the results.').length).toBe(1);
  });

  it('removes variants along with their base word via custom list', () => {
    const withoutDelve = aiTellsVocabulary.filter(v => v.word !== 'delve');
    expect(detectAiTells('We are delving into it.', withoutDelve, [], [])).toEqual([]);
  });

  // ── Phrase word boundaries ──

  it('does not match phrases inside other words', () => {
    // "at its core" must not fire inside "that its core"
    expect(detectAiTells('We believe that its core values matter.')).toEqual([]);
    // "embrace the" must not fire inside "embrace them"
    expect(detectAiTells('We embrace them warmly.')).toEqual([]);
  });

  it('matches phrases with curly apostrophes', () => {
    const results = detectAiTells('It’s worth noting that this matters.');
    expect(results).toHaveLength(1);
  });

  it('matches phrases across a hard line wrap', () => {
    const results = detectAiTells('This is important when it\ncomes to testing.');
    expect(results).toHaveLength(1);
  });

  // ── Overlap dedupe ──

  it('reports a vocab word inside a longer phrase only once (outermost span)', () => {
    const results = detectAiTells("Let's delve into this.");
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Let's delve");
  });

  it('dedupes identical spans reported by two rules', () => {
    const t = 'It is a testament to the team.';
    const results = detectAiTells(t);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('a testament to');
  });

  // ── Structural patterns ──

  it('default pattern list has named, compilable entries', () => {
    expect(aiTellsPatterns.length).toBeGreaterThanOrEqual(10);
    for (const p of aiTellsPatterns) {
      expect(p.name).toMatch(/^[a-z0-9-]+$/);
      expect(() => new RegExp(p.pattern, 'gi')).not.toThrow();
      expect(p.reason.length).toBeGreaterThan(0);
    }
  });

  it('detects negative parallelism', () => {
    const r = detectAiTells("It's not just about speed, it's about reliability.");
    expect(r.some(m => m.reason.includes('parallelism'))).toBe(true);
    const r2 = detectAiTells("This is not a bug fix. It's a rewrite.");
    expect(r2.some(m => m.reason.includes('parallelism'))).toBe(true);
  });

  it('does not flag a plain "not just" sentence', () => {
    expect(detectAiTells('It is not just a config file that you need.')).toEqual([]);
  });

  it('detects trailing participial analysis clauses', () => {
    const r = detectAiTells('Attendance doubled, underscoring the growing significance.');
    expect(r.length).toBeGreaterThan(0);
  });

  it('does not flag utility participials or mid-sentence gerunds', () => {
    expect(detectAiTells('The cache is warmed at boot, ensuring a fast first paint.')).toEqual([]);
    expect(detectAiTells('After highlighting the row, press Delete.')).toEqual([]);
  });

  it('detects vague authority attribution', () => {
    expect(detectAiTells('Experts agree that hydration is important.').length).toBe(1);
    expect(detectAiTells('Studies show the market will double.').length).toBe(1);
    expect(detectAiTells('Two experts reviewed the patch.')).toEqual([]);
  });

  it('detects audience-hedging openers but not genuine conditionals', () => {
    expect(detectAiTells("Whether you're a beginner or an expert, this helps.").length).toBe(1);
    expect(detectAiTells("Ask whether you're allowed to deploy on Fridays.")).toEqual([]);
  });

  it('detects the despite-challenges formula but not plain despite', () => {
    expect(detectAiTells('Despite its success, the canal faces challenges from climate change.').length).toBe(1);
    expect(detectAiTells('Despite the rain, the event went ahead.')).toEqual([]);
  });

  it('detects pivotal-role claims for adjective variants', () => {
    expect(detectAiTells('She played a key role in the merger.').length).toBe(1);
    expect(detectAiTells('It plays a vital part in the pipeline.').length).toBe(1);
  });

  it('detects chained false ranges but not simple from-to', () => {
    expect(detectAiTells('From legal frameworks to sustainability reports, from PR campaigns to guest experiences, we cover it all.').length).toBe(1);
    expect(detectAiTells('Migrate from v1 to v2, and read the changelog first.')).toEqual([]);
  });

  it('detects unfilled placeholders but not Markdown links', () => {
    expect(detectAiTells('Sincerely, [Your Name]').length).toBe(1);
    expect(detectAiTells('See the [docs](https://example.com) for info.')).toEqual([]);
  });

  it('detects chatbot artifacts', () => {
    expect(detectAiTells('As an AI language model, I cannot browse the internet.').length).toBeGreaterThan(0);
    expect(detectAiTells('As of my last knowledge update in 2023, this was true.').length).toBeGreaterThan(0);
  });

  it('accepts a custom pattern list', () => {
    const custom = [{ name: 'test-pattern', pattern: '\\bfoo bar\\b', reason: 'Custom structural rule' }];
    const r = detectAiTells('This is foo bar here.', [], [], custom);
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('Custom structural rule');
  });

  it('skips invalid patterns without crashing', () => {
    const bad = [{ name: 'broken', pattern: '(unclosed', reason: 'bad' }];
    expect(detectAiTells('any text at all', [], [], bad)).toEqual([]);
  });

  it('an empty pattern list disables structural detection', () => {
    expect(detectAiTells('Experts agree this works.', [], [], [])).toEqual([]);
  });

  it('dedupes 8k repeated vocabulary hits in under 200ms', () => {
    const text = 'delve '.repeat(8000);
    const start = performance.now();
    const results = detectAiTells(text);
    const elapsed = performance.now() - start;
    expect(results.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(200);
  });
});

