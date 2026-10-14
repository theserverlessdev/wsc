import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Resolve tinyglobby from the CLI package (the Action builds cli/ first) so
// `files` matches exactly what `wsc check` would glob.
const require = createRequire(new URL('../cli/package.json', import.meta.url));

// Same dirs the CLI always skips; it would drop these paths anyway.
const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**'];

/**
 * Decide which paths the GitHub Action passes to `wsc check`.
 *
 * On a pull_request with only-changed, glob `files` with the CLI's globber
 * and keep the changed paths it finds. Deleted files no longer exist, so they
 * drop out. An empty intersection skips the check. Other events keep the
 * `files` glob as given.
 *
 * `changed` is newline separated (paths may contain spaces); `files` is
 * whitespace separated, as before.
 *
 * @param {{ onlyChanged?: string, eventName?: string, changed?: string, files?: string }} input
 * @param {string} [cwd]
 * @returns {{ skip: boolean, files: string[] }}
 */
export function selectActionFiles(input, cwd = process.cwd()) {
  const onlyChanged = input.onlyChanged ?? '';
  const eventName = input.eventName ?? '';
  const patterns = String(input.files ?? '').split(/\s+/).filter(Boolean);
  if (onlyChanged !== 'true' || eventName !== 'pull_request') {
    return { skip: false, files: patterns };
  }

  const changed = String(input.changed ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const { globSync, escapePath } = require('tinyglobby');
  const matched = new Set(patterns.length ? globSync(patterns, { cwd, ignore: ALWAYS_IGNORE }) : []);
  const hit = [...new Set(changed)].filter((file) => matched.has(file));
  if (hit.length === 0) return { skip: true, files: [] };
  // Escape so the CLI globs each path literally (e.g. `(draft).md`), and keep
  // a leading `-` from being read as a flag.
  return {
    skip: false,
    files: hit.map((file) => {
      const pattern = escapePath(file);
      return pattern.startsWith('-') ? `./${pattern}` : pattern;
    }),
  };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  // import.meta.url is the real path; argv[1] may run through a symlink
  // (e.g. a self-hosted runner work dir, or /tmp on macOS).
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const result = selectActionFiles({
    onlyChanged: process.env.WSC_ONLY_CHANGED,
    eventName: process.env.WSC_EVENT_NAME,
    changed: process.env.WSC_CHANGED,
    files: process.env.WSC_FILES,
  });
  // Exit 10 means skip. Exit 0 prints one pattern per line for `wsc check`.
  // A status code keeps an empty pattern list distinct from a skip.
  if (result.skip) {
    process.exitCode = 10;
  } else if (result.files.length > 0) {
    process.stdout.write(`${result.files.join('\n')}\n`);
  }
}
