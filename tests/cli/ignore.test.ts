import { describe, it, expect } from 'vitest';
import { parseIgnorePatterns, buildIgnoreList } from '../../cli/ignore';

describe('parseIgnorePatterns', () => {
  it('returns [] for empty or omitted input', () => {
    expect(parseIgnorePatterns()).toEqual([]);
    expect(parseIgnorePatterns(undefined)).toEqual([]);
    expect(parseIgnorePatterns('')).toEqual([]);
    expect(parseIgnorePatterns('   ')).toEqual([]);
    expect(parseIgnorePatterns([])).toEqual([]);
  });

  it('accepts a single glob', () => {
    expect(parseIgnorePatterns('SKIP.md')).toEqual(['SKIP.md']);
  });

  it('splits comma-separated globs and trims whitespace', () => {
    expect(parseIgnorePatterns(' SKIP.md , vendor/** , ')).toEqual(['SKIP.md', 'vendor/**']);
  });

  it('splits newline-separated globs (Action multiline input)', () => {
    expect(parseIgnorePatterns('content/00.front-matter.md\ncontent/07.contributions.md\n')).toEqual([
      'content/00.front-matter.md',
      'content/07.contributions.md',
    ]);
  });

  it('splits CRLF and mixed comma/newline lists', () => {
    expect(parseIgnorePatterns('A.md\r\nB.md,C.md')).toEqual(['A.md', 'B.md', 'C.md']);
  });

  it('keeps commas inside brace globs', () => {
    expect(parseIgnorePatterns('docs/{draft,old}/**,CHANGELOG.md')).toEqual(['docs/{draft,old}/**', 'CHANGELOG.md']);
  });

  it('dedupes repeated patterns across array chunks', () => {
    expect(parseIgnorePatterns(['A.md', 'A.md,B.md'])).toEqual(['A.md', 'B.md']);
  });
});

describe('buildIgnoreList', () => {
  it('always includes node_modules and .git', () => {
    expect(buildIgnoreList()).toEqual(['**/node_modules/**', '**/.git/**']);
  });

  it('unions config ignore with extra CLI/Action patterns (does not replace)', () => {
    expect(buildIgnoreList(['from-config.md'], 'from-action.md,vendor/**')).toEqual([
      '**/node_modules/**',
      '**/.git/**',
      'from-config.md',
      'from-action.md',
      'vendor/**',
    ]);
  });

  it('adds nothing extra when exclude is empty', () => {
    expect(buildIgnoreList(['from-config.md'], '')).toEqual([
      '**/node_modules/**',
      '**/.git/**',
      'from-config.md',
    ]);
  });
});
