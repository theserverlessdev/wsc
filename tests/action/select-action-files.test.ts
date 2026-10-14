import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { globSync } from 'tinyglobby';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeText } from '../../src/core/analyzer';
import { loadConfigFromFile } from '../../src/core/config-node';
import { selectActionFiles } from '../../scripts/select-action-files.mjs';

describe('selectActionFiles', () => {
  // A checkout with docs, code, and the dirs the CLI always skips.
  const repo = mkdtempSync(join(tmpdir(), 'wsc-select-'));
  for (const file of [
    'README.md',
    'CHANGELOG.md',
    'notes.txt',
    'guide.rst',
    'src/main.ts',
    'docs/guide.md',
    'docs/sub/deep.md',
    'docs/(draft).md',
    'docs/my notes.md',
    '-dash.md',
    '.github/pr.md',
    'node_modules/pkg/README.md',
  ]) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), 'text\n');
  }
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  function pr(changed: string[], files: string) {
    return selectActionFiles(
      { onlyChanged: 'true', eventName: 'pull_request', changed: changed.join('\n'), files },
      repo,
    );
  }

  it('keeps the files glob when only-changed is off', () => {
    expect(
      selectActionFiles({
        onlyChanged: 'false',
        eventName: 'pull_request',
        changed: '',
        files: '**/*.md',
      }),
    ).toEqual({ skip: false, files: ['**/*.md'] });
  });

  it('keeps the files glob on non-PR events when only-changed is set', () => {
    expect(
      selectActionFiles({
        onlyChanged: 'true',
        eventName: 'push',
        changed: '',
        files: 'docs/**/*.md README.md',
      }),
    ).toEqual({ skip: false, files: ['docs/**/*.md', 'README.md'] });
  });

  it('skips a pull request that changes no files', () => {
    expect(pr([], '**/*.md')).toEqual({ skip: true, files: [] });
  });

  it('skips a pull request whose changes miss the files glob', () => {
    expect(pr(['src/main.ts', 'notes.txt'], '**/*.md')).toEqual({ skip: true, files: [] });
  });

  it('intersects changed paths with the files glob', () => {
    expect(pr(['README.md', 'src/main.ts', 'docs/guide.md', 'notes.txt'], 'docs/**/*.md')).toEqual({
      skip: false,
      files: ['docs/guide.md'],
    });
  });

  it('matches root-level files with the default glob', () => {
    expect(pr(['README.md', 'src/main.ts'], '**/*.md')).toEqual({ skip: false, files: ['README.md'] });
  });

  it('keeps txt and rst when the files glob includes them', () => {
    expect(pr(['notes.txt', 'guide.rst', 'README.md', 'src/main.ts'], '**/*.{md,txt,rst}')).toEqual({
      skip: false,
      files: ['notes.txt', 'guide.rst', 'README.md'],
    });
  });

  it('matches several space-separated file globs', () => {
    expect(pr(['README.md', 'docs/guide.md', 'src/main.ts'], 'docs/**/*.md README.md')).toEqual({
      skip: false,
      files: ['README.md', 'docs/guide.md'],
    });
  });

  it('drops deleted files and skips when only deleted docs changed', () => {
    expect(pr(['docs/removed.md', 'docs/guide.md'], '**/*.md')).toEqual({
      skip: false,
      files: ['docs/guide.md'],
    });
    expect(pr(['docs/removed.md'], '**/*.md')).toEqual({ skip: true, files: [] });
  });

  it('globs files like the CLI: directories, ./ prefixes, and negation', () => {
    expect(pr(['docs/sub/deep.md', 'README.md'], 'docs')).toEqual({
      skip: false,
      files: ['docs/sub/deep.md'],
    });
    expect(pr(['docs/guide.md'], './docs/**/*.md')).toEqual({ skip: false, files: ['docs/guide.md'] });
    expect(pr(['CHANGELOG.md', 'README.md'], '**/*.md !CHANGELOG.md')).toEqual({
      skip: false,
      files: ['README.md'],
    });
  });

  it('skips dotfiles and node_modules like the CLI', () => {
    expect(pr(['.github/pr.md', 'node_modules/pkg/README.md'], '**/*.md')).toEqual({
      skip: true,
      files: [],
    });
  });

  it('keeps paths with spaces whole and escapes glob characters', () => {
    expect(pr(['docs/my notes.md', 'docs/(draft).md', '-dash.md'], '**/*.md')).toEqual({
      skip: false,
      files: ['docs/my notes.md', 'docs/\\(draft\\).md', './-dash.md'],
    });
  });

  it('emits patterns the CLI globber resolves back to the same files', () => {
    const { files } = pr(['docs/my notes.md', 'docs/(draft).md', '-dash.md'], '**/*.md');
    expect(globSync(files, { cwd: repo }).sort()).toEqual(['-dash.md', 'docs/(draft).md', 'docs/my notes.md']);
  });
});

describe('select-action-files script', () => {
  function run(env: Record<string, string>) {
    return spawnSync(process.execPath, ['--no-warnings', 'scripts/select-action-files.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  }

  it('exits 10 when a pull request has no matching docs', () => {
    const res = run({
      WSC_ONLY_CHANGED: 'true',
      WSC_EVENT_NAME: 'pull_request',
      WSC_CHANGED: 'src/main.ts',
      WSC_FILES: '**/*.md',
    });
    expect(res.status).toBe(10);
    expect(res.stdout).toBe('');
  });

  it('prints the files glob for a push', () => {
    const res = run({
      WSC_ONLY_CHANGED: 'true',
      WSC_EVENT_NAME: 'push',
      WSC_CHANGED: '',
      WSC_FILES: '**/*.md',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('**/*.md\n');
  });

  it('prints one pattern per line', () => {
    const push = run({
      WSC_ONLY_CHANGED: 'false',
      WSC_EVENT_NAME: 'push',
      WSC_CHANGED: '',
      WSC_FILES: 'docs/**/*.md README.md',
    });
    expect(push.status).toBe(0);
    expect(push.stdout).toBe('docs/**/*.md\nREADME.md\n');

    const pull = run({
      WSC_ONLY_CHANGED: 'true',
      WSC_EVENT_NAME: 'pull_request',
      WSC_CHANGED: 'README.md\nsrc/core/index.ts\nsrc/docs/config.md\nsrc/docs/deleted.md',
      WSC_FILES: '**/*.md',
    });
    expect(pull.status).toBe(0);
    expect(pull.stdout).toBe('README.md\nsrc/docs/config.md\n');
  });

  it('prints nothing and exits 0 when the files glob is empty and only-changed is off', () => {
    const res = run({
      WSC_ONLY_CHANGED: 'false',
      WSC_EVENT_NAME: 'pull_request',
      WSC_CHANGED: '',
      WSC_FILES: '',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('');
  });
});

describe('ignore docs', () => {
  it('describes ignore as globs unioned with built-in skips, exclude, and --ignore', () => {
    const configDoc = readFileSync('src/docs/config.md', 'utf8');
    const readme = readFileSync('README.md', 'utf8');
    const schema = JSON.parse(readFileSync('static/schema.json', 'utf8'));
    for (const text of [configDoc, readme]) {
      expect(text).toContain('**/node_modules/**');
      expect(text).toContain('**/.git/**');
      expect(text).toContain('exclude');
      expect(text).toContain('--ignore');
    }
    expect(schema.properties.ignore.type).toBe('array');
    expect(schema.properties.ignore.description).toContain('node_modules');
    expect(schema.properties.ignore.description).toContain('--ignore');
  });

  it('keeps the edited docs free of style issues', async () => {
    const config = await loadConfigFromFile('.wscrc.json');
    for (const file of ['README.md', 'src/docs/config.md', 'src/docs/github-action.md', 'action/README.md']) {
      const text = readFileSync(file, 'utf8');
      const result = analyzeText(text, config, { markdown: true });
      expect(result.summary.total, file).toBe(0);
    }
  });
});

describe('action.yml only-changed wiring', () => {
  it('does not fall back to the files glob when the changed list is empty', () => {
    for (const file of ['action.yml', 'action/action.yml']) {
      const yml = readFileSync(file, 'utf8');
      expect(yml).not.toContain('steps.changed.outputs.files ||');
      expect(yml).toContain('select-action-files.mjs');
      expect(yml).toContain('total-issues=0');
      expect(yml).toContain('Skipping check.');
    }
  });
});
