import pico from 'picocolors';
import type { AnalysisResult } from '../src/core/analyzer.js';
import { makeLineIndex } from '../src/core/linecol.js';

// Pattern matches can span most of a sentence; keep display lines readable.
function truncate(s: string, max = 48): string {
  const clean = s.replace(/\u0000+/g, ' ');
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function labelize(c: ReturnType<typeof pico.createColors>) {
  return {
    'weasel-word': c.yellow,
    'passive-voice': c.magenta,
    'duplicate-word': c.red,
    'long-sentence': c.blue,
    'nominalization': c.cyan,
    'hedging': c.green,
    'filler-adverb': c.blue,
    'ai-tell': c.red,
  } as Record<string, (s: string) => string>;
}

export function formatTextWithLineCol(
  filePath: string,
  text: string,
  result: AnalysisResult,
  useColor = false,
): string {
  const lines: string[] = [];
  const { issues } = result;
  const c = pico.createColors(useColor);
  const paint = labelize(c);
  const loc = (line: number, col: number) => c.dim(`${filePath}:${line}:${col}`);
  const tag = (label: string) => paint[label](label);

  const locate = makeLineIndex(text);
  const getLineCol = (index: number) => {
    const { line, column } = locate(index);
    return { line, col: column };
  };

  for (const w of issues.weaselWords) {
    const { line, col } = getLineCol(w.index);
    lines.push(`${loc(line, col)}  ${tag('weasel-word')}  "${w.word}"`);
  }
  for (const p of issues.passiveVoice) {
    const { line, col } = getLineCol(p.index);
    lines.push(`${loc(line, col)}  ${tag('passive-voice')}  "${p.phrase}"`);
  }
  for (const d of issues.duplicateWords) {
    const { line, col } = getLineCol(d.index);
    lines.push(`${loc(line, col)}  ${tag('duplicate-word')}  "${d.word}"`);
  }
  for (const s of issues.longSentences) {
    const { line, col } = getLineCol(s.index);
    lines.push(`${loc(line, col)}  ${tag('long-sentence')}  ${s.wordCount} words`);
  }
  for (const n of issues.nominalizations) {
    const { line, col } = getLineCol(n.index);
    lines.push(`${loc(line, col)}  ${tag('nominalization')}  "${n.word}" → ${n.suggestion}`);
  }
  for (const h of issues.hedging) {
    const { line, col } = getLineCol(h.index);
    lines.push(`${loc(line, col)}  ${tag('hedging')}  "${h.phrase}"`);
  }
  for (const a of issues.adverbs) {
    const { line, col } = getLineCol(a.index);
    lines.push(`${loc(line, col)}  ${tag('filler-adverb')}  "${a.word}"`);
  }
  for (const t of issues.aiTells) {
    const { line, col } = getLineCol(t.index);
    lines.push(`${loc(line, col)}  ${tag('ai-tell')}  "${truncate(t.text)}" — ${t.reason}`);
  }

  return lines.join('\n');
}

export function formatJson(files: Array<{ path: string; result: AnalysisResult }>): string {
  return JSON.stringify(files.map(f => ({
    file: f.path,
    ...f.result,
  })), null, 2);
}

function escapeWorkflowData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeWorkflowProperty(s: string): string {
  return escapeWorkflowData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function githubWarning(filePath: string, line: number, col: number, message: string): string {
  return `::warning file=${escapeWorkflowProperty(filePath)},line=${line},col=${col}::${escapeWorkflowData(message)}`;
}

export function formatGitHub(
  filePath: string,
  text: string,
  result: AnalysisResult,
): string {
  const lines: string[] = [];
  const { issues } = result;

  const locate = makeLineIndex(text);
  const getLineCol = (index: number) => {
    const { line, column } = locate(index);
    return { line, col: column };
  };

  for (const w of issues.weaselWords) {
    const { line, col } = getLineCol(w.index);
    lines.push(githubWarning(filePath, line, col, `Weasel word: "${w.word}"`));
  }
  for (const p of issues.passiveVoice) {
    const { line, col } = getLineCol(p.index);
    lines.push(githubWarning(filePath, line, col, `Passive voice: "${p.phrase}"`));
  }
  for (const d of issues.duplicateWords) {
    const { line, col } = getLineCol(d.index);
    lines.push(githubWarning(filePath, line, col, `Duplicate word: "${d.word}"`));
  }
  for (const s of issues.longSentences) {
    const { line, col } = getLineCol(s.index);
    lines.push(githubWarning(filePath, line, col, `Long sentence: ${s.wordCount} words`));
  }
  for (const n of issues.nominalizations) {
    const { line, col } = getLineCol(n.index);
    lines.push(githubWarning(filePath, line, col, `Nominalization: "${n.word}" (try: ${n.suggestion})`));
  }
  for (const h of issues.hedging) {
    const { line, col } = getLineCol(h.index);
    lines.push(githubWarning(filePath, line, col, `Hedging: "${h.phrase}"`));
  }
  for (const a of issues.adverbs) {
    const { line, col } = getLineCol(a.index);
    lines.push(githubWarning(filePath, line, col, `Filler adverb: "${a.word}"`));
  }
  for (const t of issues.aiTells) {
    const { line, col } = getLineCol(t.index);
    lines.push(githubWarning(filePath, line, col, `AI tell: "${truncate(t.text)}" — ${t.reason}`));
  }

  return lines.join('\n');
}

export function formatSummary(totalIssues: number, fileCount: number, useColor = false): string {
  const c = pico.createColors(useColor);
  if (totalIssues === 0) {
    return c.green(`No issues found in ${fileCount} file${fileCount !== 1 ? 's' : ''}.`);
  }
  return c.yellow(`Found ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}.`);
}
