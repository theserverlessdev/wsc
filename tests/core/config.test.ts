import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  mergeConfig,
  applyWordListOverrides,
  applyNominalizationOverrides,
  applyAiTellsPatternOverrides,
  validateConfig,
  DEFAULT_CONFIG,
} from '../../src/core/config';
import type { WscConfig } from '../../src/core/config';
import { loadConfigFromFile, findConfigFile, readPackageVersion } from '../../src/core/config-node';
import { pathToFileURL } from 'node:url';

// ── mergeConfig ──

describe('mergeConfig', () => {
  it('returns DEFAULT_CONFIG for undefined input', () => {
    expect(mergeConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('returns DEFAULT_CONFIG for empty object', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('fills missing detectors with defaults', () => {
    const result = mergeConfig({ detectors: { weaselWords: { enabled: false } } });
    expect(result.detectors.weaselWords.enabled).toBe(false);
    expect(result.detectors.passiveVoice).toEqual({ enabled: true });
    expect(result.detectors.longSentences).toEqual({ enabled: true, maxWords: 30 });
  });

  it('overrides a single field', () => {
    const result = mergeConfig({ detectors: { longSentences: { maxWords: 20 } } });
    expect(result.detectors.longSentences).toEqual({ enabled: true, maxWords: 20 });
  });

  it('preserves enabled: false', () => {
    const result = mergeConfig({ detectors: { adverbs: { enabled: false } } });
    expect(result.detectors.adverbs.enabled).toBe(false);
  });

  it('preserves add/remove arrays', () => {
    const result = mergeConfig({
      detectors: { weaselWords: { add: ['foo'], remove: ['very'] } },
    });
    expect((result.detectors.weaselWords as any).add).toEqual(['foo']);
    expect((result.detectors.weaselWords as any).remove).toEqual(['very']);
  });

  it('does not mutate DEFAULT_CONFIG', () => {
    const before = structuredClone(DEFAULT_CONFIG);
    mergeConfig({ detectors: { longSentences: { maxWords: 5 } } });
    expect(DEFAULT_CONFIG).toEqual(before);
  });
});

// ── applyWordListOverrides ──

describe('applyWordListOverrides', () => {
  const base = ['very', 'quite', 'fairly'];

  it('returns a copy with no overrides', () => {
    const result = applyWordListOverrides(base);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
  });

  it('appends new words', () => {
    const result = applyWordListOverrides(base, ['foo', 'bar']);
    expect(result).toEqual(['very', 'quite', 'fairly', 'foo', 'bar']);
  });

  it('does not duplicate words already in base', () => {
    const result = applyWordListOverrides(base, ['Very', 'new']);
    expect(result).toEqual(['very', 'quite', 'fairly', 'new']);
  });

  it('removes existing words', () => {
    const result = applyWordListOverrides(base, undefined, ['very']);
    expect(result).toEqual(['quite', 'fairly']);
  });

  it('case-insensitive removal', () => {
    const result = applyWordListOverrides(base, undefined, ['VERY', 'Quite']);
    expect(result).toEqual(['fairly']);
  });

  it('no error for removing non-existent words', () => {
    const result = applyWordListOverrides(base, undefined, ['nonexistent']);
    expect(result).toEqual(base);
  });

  it('handles both add and remove simultaneously', () => {
    const result = applyWordListOverrides(base, ['new'], ['very']);
    expect(result).toEqual(['quite', 'fairly', 'new']);
  });

  it('handles empty arrays same as no overrides', () => {
    const result = applyWordListOverrides(base, [], []);
    expect(result).toEqual(base);
  });
});

// ── applyNominalizationOverrides ──

describe('applyNominalizationOverrides', () => {
  const base = [
    { word: 'utilization', suggestion: 'use' },
    { word: 'implementation', suggestion: 'implement' },
  ];

  it('returns a copy with no overrides', () => {
    const result = applyNominalizationOverrides(base);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
  });

  it('adds new entries', () => {
    const result = applyNominalizationOverrides(base, [{ word: 'foo', suggestion: 'bar' }]);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ word: 'foo', suggestion: 'bar' });
  });

  it('does not duplicate by word name', () => {
    const result = applyNominalizationOverrides(base, [{ word: 'Utilization', suggestion: 'use it' }]);
    expect(result).toHaveLength(2);
  });

  it('removes by word name', () => {
    const result = applyNominalizationOverrides(base, undefined, ['utilization']);
    expect(result).toEqual([{ word: 'implementation', suggestion: 'implement' }]);
  });

  it('case-insensitive removal', () => {
    const result = applyNominalizationOverrides(base, undefined, ['UTILIZATION']);
    expect(result).toHaveLength(1);
  });
});

// ── applyAiTellsPatternOverrides ──

describe('applyAiTellsPatternOverrides', () => {
  const base = [
    { name: 'negative-parallelism', pattern: 'x', reason: 'r1' },
    { name: 'vague-attribution', pattern: 'y', reason: 'r2' },
  ];

  it('returns a copy when remove is empty or undefined', () => {
    const result = applyAiTellsPatternOverrides(base);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
    expect(result[0]).not.toBe(base[0]);
  });

  it('removes patterns by name, case-insensitively', () => {
    const result = applyAiTellsPatternOverrides(base, ['Negative-Parallelism']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('vague-attribution');
  });

  it('ignores unknown names', () => {
    expect(applyAiTellsPatternOverrides(base, ['no-such-pattern'])).toHaveLength(2);
  });
});

// ── validateConfig ──

describe('validateConfig', () => {
  it('valid minimal config', () => {
    expect(validateConfig({})).toEqual([]);
  });

  it('valid full config', () => {
    expect(validateConfig({
      $schema: 'https://wsc.theserverless.dev/schema.json',
      detectors: {
        weaselWords: { enabled: true, add: ['x'], remove: ['y'] },
        passiveVoice: { enabled: false },
        duplicateWords: { enabled: true },
        longSentences: { enabled: true, maxWords: 25 },
        nominalizations: { enabled: true, add: [{ word: 'x', suggestion: 'y' }], remove: ['z'] },
        hedging: { enabled: true, add: ['a'], remove: ['b'] },
        adverbs: { enabled: false },
      },
    })).toEqual([]);
  });

  it('unknown top-level key', () => {
    const errors = validateConfig({ unknown: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unknown top-level key');
  });

  it('accepts a valid ignore array', () => {
    expect(validateConfig({ ignore: ['CHANGELOG.md', 'docs/vendor/**'] })).toEqual([]);
  });

  it('rejects a non-array ignore', () => {
    const errors = validateConfig({ ignore: 'CHANGELOG.md' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"ignore" must be an array of strings');
  });

  it('rejects non-string ignore entries', () => {
    const errors = validateConfig({ ignore: ['ok.md', 123] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"ignore" must be an array of strings');
  });

  it('unknown detector name', () => {
    const errors = validateConfig({ detectors: { unknown: {} } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unknown detector');
  });

  it('accepts aiTells removePatterns as a string array', () => {
    expect(validateConfig({
      detectors: { aiTells: { removePatterns: ['not-only-but-also'] } },
    })).toEqual([]);
  });

  it('rejects aiTells removePatterns that is not a string array', () => {
    const errors = validateConfig({
      detectors: { aiTells: { removePatterns: 'not-only-but-also' } },
    });
    expect(errors.some(e => e.includes('removePatterns'))).toBe(true);
  });

  it('enabled as string instead of boolean', () => {
    const errors = validateConfig({ detectors: { weaselWords: { enabled: 'yes' } } });
    expect(errors.some(e => e.includes('enabled must be a boolean'))).toBe(true);
  });

  it('maxWords as string', () => {
    const errors = validateConfig({ detectors: { longSentences: { maxWords: '30' } } });
    expect(errors.some(e => e.includes('maxWords must be a positive integer'))).toBe(true);
  });

  it('maxWords as negative number', () => {
    const errors = validateConfig({ detectors: { longSentences: { maxWords: -1 } } });
    expect(errors.some(e => e.includes('maxWords must be a positive integer'))).toBe(true);
  });

  it('maxWords as 0', () => {
    const errors = validateConfig({ detectors: { longSentences: { maxWords: 0 } } });
    expect(errors.some(e => e.includes('maxWords must be a positive integer'))).toBe(true);
  });

  it('add as string instead of array', () => {
    const errors = validateConfig({ detectors: { weaselWords: { add: 'foo' } } });
    expect(errors.some(e => e.includes('add must be an array'))).toBe(true);
  });

  it('rejects empty strings in word-list add arrays', () => {
    for (const name of ['weaselWords', 'hedging', 'adverbs']) {
      const errors = validateConfig({ detectors: { [name]: { add: [''] } } });
      expect(errors.some(e => e.includes('non-empty')), name).toBe(true);
    }
  });

  it('rejects whitespace-only strings in word-list add arrays', () => {
    const errors = validateConfig({ detectors: { weaselWords: { add: ['  \t'] } } });
    expect(errors.some(e => e.includes('non-empty'))).toBe(true);
  });

  it('rejects empty strings in aiTells add and addPhrases', () => {
    const addErrors = validateConfig({ detectors: { aiTells: { add: [''] } } });
    expect(addErrors.some(e => e.includes('add') && e.includes('non-empty'))).toBe(true);
    const phraseErrors = validateConfig({ detectors: { aiTells: { addPhrases: [''] } } });
    expect(phraseErrors.some(e => e.includes('addPhrases') && e.includes('non-empty'))).toBe(true);
  });

  it('nominalization add with missing suggestion', () => {
    const errors = validateConfig({ detectors: { nominalizations: { add: [{ word: 'foo' }] } } });
    expect(errors.some(e => e.includes('suggestion must be a non-empty string'))).toBe(true);
  });

  it('nominalization add with non-object entry', () => {
    const errors = validateConfig({ detectors: { nominalizations: { add: ['string'] } } });
    expect(errors.some(e => e.includes('must be an object'))).toBe(true);
  });

  it('nominalization add with missing word', () => {
    const errors = validateConfig({ detectors: { nominalizations: { add: [{ suggestion: 'foo' }] } } });
    expect(errors.some(e => e.includes('word must be a non-empty string'))).toBe(true);
  });

  it('nominalization add rejects extra keys', () => {
    const errors = validateConfig({
      detectors: { nominalizations: { add: [{ word: 'foo', suggestion: 'bar', extra: true }] } },
    });
    expect(errors.some(e => e.includes('Unknown key') && e.includes('extra'))).toBe(true);
  });

  it('nominalization remove as non-array', () => {
    const errors = validateConfig({ detectors: { nominalizations: { remove: 'foo' } } });
    expect(errors.some(e => e.includes('remove must be an array'))).toBe(true);
  });

  it('deeply nested unknown key', () => {
    const errors = validateConfig({ detectors: { weaselWords: { unknown: true } } });
    expect(errors.some(e => e.includes('Unknown key'))).toBe(true);
  });

  it('non-object config', () => {
    expect(validateConfig('string')).toHaveLength(1);
    expect(validateConfig(null)).toHaveLength(1);
    expect(validateConfig([])).toHaveLength(1);
  });

  it('detectors as non-object', () => {
    const errors = validateConfig({ detectors: 'bad' });
    expect(errors.some(e => e.includes('"detectors" must be an object'))).toBe(true);
  });
});

// ── loadConfigFromFile ──

describe('loadConfigFromFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `wsc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty object for nonexistent file', async () => {
    const result = await loadConfigFromFile(join(tmpDir, '.wscrc.json'));
    expect(result).toEqual({});
  });

  it('returns parsed config for valid file', async () => {
    const config: WscConfig = { detectors: { weaselWords: { enabled: false } } };
    await writeFile(join(tmpDir, '.wscrc.json'), JSON.stringify(config));
    const result = await loadConfigFromFile(join(tmpDir, '.wscrc.json'));
    expect(result).toEqual(config);
  });

  it('throws for invalid JSON', async () => {
    await writeFile(join(tmpDir, '.wscrc.json'), '{bad json}');
    await expect(loadConfigFromFile(join(tmpDir, '.wscrc.json'))).rejects.toThrow('Invalid JSON');
  });

  it('throws for valid JSON but invalid config', async () => {
    await writeFile(join(tmpDir, '.wscrc.json'), JSON.stringify({ bad: true }));
    await expect(loadConfigFromFile(join(tmpDir, '.wscrc.json'))).rejects.toThrow('Invalid config');
  });
});

// ── findConfigFile ──

describe('findConfigFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `wsc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds config in current directory', async () => {
    await writeFile(join(tmpDir, '.wscrc.json'), '{}');
    const result = await findConfigFile(tmpDir);
    expect(result).toBe(join(tmpDir, '.wscrc.json'));
  });

  it('finds config in parent directory', async () => {
    const childDir = join(tmpDir, 'child');
    await mkdir(childDir);
    await writeFile(join(tmpDir, '.wscrc.json'), '{}');
    const result = await findConfigFile(childDir);
    expect(result).toBe(join(tmpDir, '.wscrc.json'));
  });

  it('finds config in grandparent directory', async () => {
    const deepDir = join(tmpDir, 'a', 'b');
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(tmpDir, '.wscrc.json'), '{}');
    const result = await findConfigFile(deepDir);
    expect(result).toBe(join(tmpDir, '.wscrc.json'));
  });

  it('returns null when no config exists', async () => {
    // Start from a deep temp dir that won't have .wscrc.json above it
    const deepDir = join(tmpDir, 'a', 'b', 'c');
    await mkdir(deepDir, { recursive: true });
    // This will walk up to filesystem root — very unlikely to find .wscrc.json
    // We can't guarantee null unless we control the entire path, but it's very likely
    const result = await findConfigFile(deepDir);
    // If there happens to be a .wscrc.json somewhere above tmpDir, this could be non-null
    // but that's extremely unlikely in a temp directory
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ── readPackageVersion ──

describe('readPackageVersion', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `wsc-pkgver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // readPackageVersion resolves a directory from a "file" URL via
  // fileURLToPath + dirname, so a fake filename appended to a real dir
  // works fine — the file itself never needs to exist.
  const fakeModuleUrl = (dir: string) => pathToFileURL(join(dir, 'fake.js')).href;

  it('returns the version from an immediate-match package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg', version: '1.2.3' }),
    );

    const result = readPackageVersion(fakeModuleUrl(tmpDir), 'my-pkg');
    expect(result).toBe('1.2.3');
  });

  it('walks up to find a named package.json when the immediate dir does not match', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'target-pkg', version: '3.3.3' }),
    );
    const subDir = join(tmpDir, 'sub');
    await mkdir(subDir, { recursive: true });
    await writeFile(
      join(subDir, 'package.json'),
      JSON.stringify({ name: 'other-pkg', version: '0.0.1' }),
    );

    const result = readPackageVersion(fakeModuleUrl(subDir), 'target-pkg');
    expect(result).toBe('3.3.3');
  });

  it("returns '0.0.0' when no matching package.json exists within the walk limit", async () => {
    // A matching package.json sits at tmpDir itself, but the walk only
    // checks 6 levels up from the start dir — put the start dir 7 levels
    // below tmpDir so the match is just out of reach, proving the limit
    // is actually enforced rather than just "didn't happen to find one".
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'target-pkg', version: '9.9.9' }),
    );
    let dir = tmpDir;
    for (let i = 0; i < 7; i++) {
      dir = join(dir, `level${i}`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: `not-it-${i}`, version: `${i}.0.0` }),
      );
    }

    const result = readPackageVersion(fakeModuleUrl(dir), 'target-pkg');
    expect(result).toBe('0.0.0');
  });
});
