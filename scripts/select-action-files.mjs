import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Decide which paths the GitHub Action passes to `wsc check`.
 *
 * On a pull_request with only-changed, intersect changed paths with the
 * `files` glob. An empty intersection skips the check. Other events keep
 * the `files` glob as given.
 *
 * Globs use Node's path.matchesGlob, which agrees with the CLI tinyglobby
 * on double-star patterns, single-star patterns, and brace sets.
 *
 * @param {{ onlyChanged?: string, eventName?: string, changed?: string, files?: string }} input
 * @returns {{ skip: boolean, files: string }}
 */
export function selectActionFiles(input) {
  const onlyChanged = input.onlyChanged ?? '';
  const eventName = input.eventName ?? '';
  const files = input.files ?? '';
  if (onlyChanged !== 'true' || eventName !== 'pull_request') {
    return { skip: false, files };
  }

  const changedList = splitTokens(input.changed);
  const patterns = splitTokens(files);
  const hit = changedList.filter((file) =>
    patterns.some((pattern) => path.matchesGlob(file, pattern)),
  );
  if (hit.length === 0) return { skip: true, files: '' };
  return { skip: false, files: hit.join(' ') };
}

function splitTokens(value) {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean);
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
  // Exit 10 means skip. Exit 0 prints the patterns to pass to `wsc check`.
  // A status code keeps an empty pattern list distinct from a skip.
  if (result.skip) {
    process.exitCode = 10;
  } else if (result.files.length > 0) {
    process.stdout.write(`${result.files}\n`);
  }
}
