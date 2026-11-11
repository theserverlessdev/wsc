// Markdown-aware preprocessing for prose checking.
//
// Writing-style detectors expect prose, but Markdown docs are full of code
// blocks, inline code, and tables — none of which are prose. Linting them
// produces noise (e.g. `configuration` in a code sample, a "128-word sentence"
// that is really a table or a directory tree). Prose linters like Vale and
// proselint ignore these regions; we do the same.
//
// Masking replaces non-prose regions while preserving length and line layout,
// so offsets map 1:1 back to the original. Two masking modes:
//  - whole-line constructs (fences, headings, tables) blank to SPACES, so a
//    blanked line still reads as a paragraph break to the sentence splitter;
//  - inline constructs (code spans, single-line HTML comments) blank to a NUL
//    sentinel, which is neither \s nor \w, so the words on either side do not
//    become adjacent ("Run `npm` run" must not read as "Run run").

const SENTINEL = '\u0000';
const blankLine = (s: string): string => s.replace(/[^\n]/g, ' ');
const blankInline = (s: string): string => SENTINEL.repeat(s.length);

/** Return true for files that should be treated as Markdown. */
export function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

/**
 * Blank out non-prose Markdown regions (fenced code blocks, inline code spans,
 * table rows, and HTML comments) while preserving the length and line layout
 * of the input so character offsets remain valid.
 */
export function maskMarkdown(input: string): string {
  const lines = input.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  const masked = lines.map((line) => {
    const openMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (inFence) {
      const closeMatch = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (
        closeMatch &&
        closeMatch[1][0] === fenceChar &&
        closeMatch[1].length >= fenceLen
      ) {
        inFence = false;
      }
      return blankLine(line);
    }

    if (openMatch) {
      const fence = openMatch[1];
      // CommonMark: a backtick fence's info string cannot contain backticks.
      if (fence[0] === '`') {
        const fenceAt = line.indexOf(fence);
        const info = line.slice(fenceAt + fence.length);
        if (info.includes('`')) {
          return line.replace(/`[^`\n]*`/g, blankInline);
        }
      }
      inFence = true;
      fenceChar = fence[0];
      fenceLen = fence.length;
      return blankLine(line);
    }

    // ATX headings are titles, not prose sentences.
    if (/^\s{0,3}#{1,6}\s/.test(line)) return blankLine(line);

    // Table rows / separators (GFM tables using a leading pipe).
    if (/^\s*\|/.test(line)) return blankLine(line);

    // Inline code spans within an otherwise-prose line.
    return line.replace(/`[^`\n]*`/g, blankInline);
  });

  let out = masked.join('\n');

  // HTML comments: indexOf rather than lazy regex, so an unclosed `<!--`
  // is O(n) instead of scanning to EOF at every opener.
  out = maskSingleLineHtmlComments(out);
  out = maskMultilineHtmlComments(out);

  return out;
}

/** Single-line `<!-- ... -->` (no newline between) → NUL sentinels. */
function maskSingleLineHtmlComments(input: string): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    const start = input.indexOf('<!--', i);
    if (start === -1) {
      result += input.slice(i);
      break;
    }
    result += input.slice(i, start);
    const end = input.indexOf('-->', start + 4);
    if (end === -1) {
      result += input.slice(start);
      break;
    }
    const newline = input.indexOf('\n', start);
    if (newline !== -1 && newline < end) {
      result += input.slice(start, newline + 1);
      i = newline + 1;
      continue;
    }
    result += SENTINEL.repeat(end + 3 - start);
    i = end + 3;
  }
  return result;
}

/** Remaining (multi-line) `<!-- ... -->` → spaces, newlines preserved. */
function maskMultilineHtmlComments(input: string): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    const start = input.indexOf('<!--', i);
    if (start === -1) {
      result += input.slice(i);
      break;
    }
    result += input.slice(i, start);
    const end = input.indexOf('-->', start + 4);
    if (end === -1) {
      result += input.slice(start);
      break;
    }
    const comment = input.slice(start, end + 3);
    result += comment.replace(/[^\n]/g, ' ');
    i = end + 3;
  }
  return result;
}
