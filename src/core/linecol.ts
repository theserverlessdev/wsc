export interface LineCol {
  line: number;
  column: number;
}

/**
 * Build a line-start index once, then map any character offset to 1-based
 * line/column in O(log n). Matches `text.substring(0, index).split('\\n')`
 * (LF-only split, so CRLF columns include the `\r`).
 */
export function makeLineIndex(text: string): (index: number) => LineCol {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }

  return (index: number): LineCol => {
    // substring(0, negative) is treated as substring(0, 0)
    const i = index < 0 ? 0 : index;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: i - starts[lo] + 1 };
  };
}
