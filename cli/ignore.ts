/**
 * Glob ignore lists for `wsc check`.
 *
 * Always skip dependency and VCS dirs. Then union config `ignore` with
 * extra patterns from CLI `--ignore` / Action `exclude`. Extra input may be
 * a string (comma or newline separated) or an array of such strings.
 */

const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**'];

/** Split Action/CLI ignore input into glob patterns. Empty tokens are dropped. */
export function parseIgnorePatterns(input?: string | string[]): string[] {
  if (input == null) return [];
  const chunks = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (typeof chunk !== 'string') continue;
    for (const part of chunk.split(/[\n\r,]+/)) {
      const pattern = part.trim();
      if (!pattern || seen.has(pattern)) continue;
      seen.add(pattern);
      out.push(pattern);
    }
  }
  return out;
}

/** Effective ignore list: built-in dirs + config ignore + extra CLI/Action patterns. */
export function buildIgnoreList(
  configIgnore?: string[],
  extraIgnore?: string | string[],
): string[] {
  return [
    ...ALWAYS_IGNORE,
    ...(configIgnore ?? []),
    ...parseIgnorePatterns(extraIgnore),
  ];
}
