/**
 * Glob ignore lists for `wsc check`.
 *
 * Always skip dependency and VCS dirs. Then union config `ignore` with
 * extra patterns from CLI `--ignore` / Action `exclude`. Extra input may be
 * a string (comma or newline separated) or an array of such strings.
 */

const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**'];

/**
 * Split on newlines and on commas outside `{...}`, so brace globs like
 * `docs/{draft,old}/**` stay one pattern.
 */
function splitPatterns(chunk: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of chunk) {
    if (ch === '{') depth++;
    else if (ch === '}' && depth > 0) depth--;
    if (ch === '\n' || ch === '\r') {
      parts.push(current);
      current = '';
      depth = 0;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Split Action/CLI ignore input into glob patterns. Empty tokens are dropped. */
export function parseIgnorePatterns(input?: string | string[]): string[] {
  if (input == null) return [];
  const chunks = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (typeof chunk !== 'string') continue;
    for (const part of splitPatterns(chunk)) {
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
