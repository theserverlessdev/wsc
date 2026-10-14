import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exitCode, run } from '../../cli/cli';

// Text guaranteed to trip several detectors (passive voice, filler adverb).
const NOISY = 'The code was written very quickly.\n';
const CLEAN = 'The team wrote good code today.\n';

describe('exitCode policy', () => {
  it('never fails when maxWarnings is negative (unlimited/annotate-only)', () => {
    expect(exitCode(0, -1)).toBe(0);
    expect(exitCode(999, -1)).toBe(0);
  });

  it('fails on any issue when maxWarnings is 0', () => {
    expect(exitCode(0, 0)).toBe(0);
    expect(exitCode(1, 0)).toBe(1);
  });

  it('fails only above the threshold', () => {
    expect(exitCode(5, 5)).toBe(0);
    expect(exitCode(6, 5)).toBe(1);
    expect(exitCode(3, 10)).toBe(0);
  });

  it('coerces string thresholds (cac may pass strings)', () => {
    expect(exitCode(6, '5' as unknown as number)).toBe(1);
    expect(exitCode(4, '5' as unknown as number)).toBe(0);
  });
});

describe('run() — exit codes propagate (regression: cac swallows action returns)', () => {
  let dir: string;
  let out: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-cli-'));
    out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0 for a file with issues under the default (-1)', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, NOISY);
    expect(await run(['node', 'wsc', 'check', f, '--quiet'])).toBe(0);
  });

  it('returns 1 when issues exceed --max-warnings', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, NOISY);
    expect(await run(['node', 'wsc', 'check', f, '--quiet', '--max-warnings', '0'])).toBe(1);
  });

  it('returns 0 when issues stay within --max-warnings', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, NOISY);
    expect(await run(['node', 'wsc', 'check', f, '--quiet', '--max-warnings', '100000'])).toBe(0);
  });

  it('returns 0 for clean text even at --max-warnings 0', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, CLEAN);
    expect(await run(['node', 'wsc', 'check', f, '--quiet', '--max-warnings', '0'])).toBe(0);
  });

  it('returns 2 when no files match the glob', async () => {
    expect(await run(['node', 'wsc', 'check', join(dir, 'nothing-*.md'), '--quiet'])).toBe(2);
  });
});

describe('run() — format validation and version', () => {
  let out: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  let captured: string;

  beforeEach(() => {
    captured = '';
    out = vi.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      captured += String(s);
      return true;
    });
    err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // cac's built-in --version/--help handling prints via console.log rather
    // than process.stdout.write, so capture that too.
    log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      captured += args.join(' ') + '\n';
    });
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    log.mockRestore();
  });

  it('exits 2 on an unknown --format value', async () => {
    const code = await run(['node', 'wsc', 'check', 'README.md', '--format', 'sarif']);
    expect(code).toBe(2);
  });

  it('reports the package.json version', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../cli/package.json', import.meta.url), 'utf-8'));
    await run(['node', 'wsc', '--version']);
    expect(captured).toContain(pkg.version);
  });
});

describe('run() — json/github output stays uncolored even when color is available', () => {
  let dir: string;
  let out: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  let captured: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-color-'));
    captured = '';
    out = vi.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      captured += String(s);
      return true;
    });
    err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('--format github: no ANSI codes anywhere, including the summary line', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, NOISY);
    await run(['node', 'wsc', 'check', f, '--format', 'github']);
    // eslint-disable-next-line no-control-regex
    expect(captured).not.toMatch(/\u001b\[/);
  });

  it('--format json: no ANSI codes anywhere, including the summary line', async () => {
    const f = join(dir, 'doc.md');
    writeFileSync(f, NOISY);
    await run(['node', 'wsc', 'check', f, '--format', 'json']);
    // eslint-disable-next-line no-control-regex
    expect(captured).not.toMatch(/\u001b\[/);
  });

  it('--format text: does emit ANSI codes when color is forced', async () => {
    // Force color via FORCE_COLOR, which cli.ts re-reads at call time, so
    // this assertion is deterministic under a plain `npx vitest run` as
    // well as under CI. Mutating `pico.isColorSupported` does NOT work
    // here: cli.ts resolves picocolors from cli/node_modules while this
    // test resolves the root copy — two separate module instances.
    const prior = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = '1';
    try {
      const f = join(dir, 'doc.md');
      writeFileSync(f, NOISY);
      await run(['node', 'wsc', 'check', f]);
      // eslint-disable-next-line no-control-regex
      expect(captured).toMatch(/\u001b\[/);
    } finally {
      if (prior === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = prior;
    }
  });
});

describe('run() — glob ignores node_modules', () => {
  let dir: string;
  let cwd: string;
  let out: ReturnType<typeof vi.spyOn>;
  let captured: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-ignore-'));
    writeFileSync(join(dir, 'doc.md'), NOISY);
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'readme.md'), NOISY);
    captured = '';
    out = vi.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      captured += String(s);
      return true;
    });
    cwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    out.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('matches only real docs, not node_modules markdown', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--format', 'json']);
    const results = JSON.parse(captured);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain('doc.md');
    expect(results[0].file).not.toContain('node_modules');
  });
});

describe('run() — honors config ignore globs', () => {
  let dir: string;
  let cwd: string;
  let out: ReturnType<typeof vi.spyOn>;
  let captured: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-cfgignore-'));
    writeFileSync(join(dir, '.wscrc.json'), JSON.stringify({ ignore: ['SKIP.md'] }));
    writeFileSync(join(dir, 'doc.md'), NOISY);
    writeFileSync(join(dir, 'SKIP.md'), NOISY);
    captured = '';
    out = vi.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      captured += String(s);
      return true;
    });
    cwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    out.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('excludes files matched by the config ignore list', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--format', 'json']);
    const results = JSON.parse(captured);
    expect(results).toHaveLength(1);
    expect(results[0].file).toContain('doc.md');
    expect(results[0].file).not.toContain('SKIP.md');
  });
});

describe('run() — --ignore stacks with config ignore', () => {
  let dir: string;
  let cwd: string;
  let out: ReturnType<typeof vi.spyOn>;
  let captured: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-cliignore-'));
    writeFileSync(join(dir, 'doc.md'), NOISY);
    writeFileSync(join(dir, 'SKIP.md'), NOISY);
    writeFileSync(join(dir, 'OTHER.md'), NOISY);
    captured = '';
    out = vi.spyOn(process.stdout, 'write').mockImplementation((s: any) => {
      captured += String(s);
      return true;
    });
    cwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    out.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('checks every matched file when --ignore is omitted', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file).sort();
    expect(files).toHaveLength(3);
    expect(files.some((f: string) => f.endsWith('doc.md'))).toBe(true);
    expect(files.some((f: string) => f.endsWith('SKIP.md'))).toBe(true);
    expect(files.some((f: string) => f.endsWith('OTHER.md'))).toBe(true);
  });

  it('excludes a single glob passed to --ignore', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--ignore', 'SKIP.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file);
    expect(files).toHaveLength(2);
    expect(files.some((f: string) => f.endsWith('SKIP.md'))).toBe(false);
  });

  it('excludes multiple comma-separated globs', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--ignore', 'SKIP.md,OTHER.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('doc.md');
  });

  it('excludes multiple newline-separated globs (Action exclude input)', async () => {
    await run(['node', 'wsc', 'check', '**/*.md', '--ignore', 'SKIP.md\nOTHER.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('doc.md');
  });

  it('unions --ignore with config ignore (neither replaces the other)', async () => {
    writeFileSync(join(dir, '.wscrc.json'), JSON.stringify({ ignore: ['SKIP.md'] }));
    await run(['node', 'wsc', 'check', '**/*.md', '--ignore', 'OTHER.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('doc.md');
  });

  it('exits 0 when every matched file is ignored (only-changed PR touching only excluded files)', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await run(['node', 'wsc', 'check', 'SKIP.md', '--ignore', 'SKIP.md', '--format', 'github']);
    err.mockRestore();
    expect(code).toBe(0);
    expect(captured).toContain('No issues found in 0 files.');
  });

  it('still exits 2 when the patterns match no files at all', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await run(['node', 'wsc', 'check', 'MISSING.md', '--ignore', 'SKIP.md']);
    err.mockRestore();
    expect(code).toBe(2);
  });

  it('still applies --ignore when files are explicit paths (only-changed)', async () => {
    await run(['node', 'wsc', 'check', 'doc.md', 'SKIP.md', '--ignore', 'SKIP.md', '--format', 'json']);
    const files = JSON.parse(captured).map((r: { file: string }) => r.file);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('doc.md');
  });
});
