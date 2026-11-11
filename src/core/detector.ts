// detector.ts
// Import word lists from data file
import {
  allWeaselWords,
  irregularVerbs,
  auxiliaryVerbs,
  nominalizations as defaultNominalizations,
  hedgingPhrases as defaultHedgingPhrases,
  fillerAdverbs as defaultFillerAdverbs,
  abbreviations,
  aiTellsVocabulary as defaultAiVocabulary,
  aiTellsPhrases as defaultAiPhrases,
  aiTellsPatterns as defaultAiPatterns,
} from "./words.js";

// A run longer than the longest abbreviation can never match one, so the
// abbreviation back-walk in splitSentences is capped at this + 1.
const MAX_ABBREVIATION_LEN = [...abbreviations].reduce((m, a) => Math.max(m, a.length), 0);

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drop empty / whitespace-only custom entries so they cannot compile to a zero-width alternative. */
function nonemptyStrings(list: string[]): string[] {
  return list.filter(s => s.trim() !== '');
}

/** Zero-width `exec` matches never advance lastIndex; bump it so the loop cannot spin forever. */
function advanceIfEmpty(regex: RegExp, match: RegExpExecArray): boolean {
  if (match[0].length === 0) {
    regex.lastIndex++;
    return true;
  }
  return false;
}

// Multi-word entries should survive hard-wrapped lines ("kind\nof") and curly
// apostrophes ("it’s"), so spaces become flexible whitespace and ‘ matches
// either apostrophe. The whitespace run may contain at most one newline —
// a blank line is a paragraph break, and phrases don’t span paragraphs.
function flexibleSource(str: string): string {
  // Collapse whitespace runs first so N spaces become ONE flexible group.
  // Adjacent `(…\s)+` groups (one per space) backtrack polynomially.
  return escapeForRegex(str.trim())
    .replace(/\s+/g, `(?:(?!\\n[ \\t\\r]*\\n)\\s)+`)
    .replace(/'/g, `['’]`);
}

export function detectWeaselWords(text: string, wordList?: string[]): Array<{
  word: string;
  index: number;
  length: number;
}> {
  const results: Array<{ word: string; index: number; length: number }> = [];
  const words = nonemptyStrings(wordList ?? allWeaselWords);
  if (words.length === 0) return results;

  // Longest-first so "kind of" wins over a hypothetical "kind" entry
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const weaselWordsPattern = new RegExp(
    `\\b(${sorted.map(flexibleSource).join("|")})\\b`,
    "gi"
  );

  let match;
  while ((match = weaselWordsPattern.exec(text)) !== null) {
    if (advanceIfEmpty(weaselWordsPattern, match)) continue;
    results.push({
      word: match[0],
      index: match.index,
      length: match[0].length,
    });
  }

  return results;
}

export function detectPassiveVoice(text: string): Array<{
  phrase: string;
  index: number;
  length: number;
}> {
  const results: Array<{ phrase: string; index: number; length: number }> = [];

  const regularPattern = "\\w+ed";
  const allVerbs = `${regularPattern}|${irregularVerbs.join("|")}`;

  // Common adjectives/nouns ending in "ed"-like letters that are not past
  // participles ("was tired", "there is need"). 'used' is deliberately
  // absent: "was used by" is genuine passive. (It belongs only in
  // getIdiomStoplist below — "got used to" is idiomatic, but "was used by"
  // is not, so it must not leak into this shared list.)
  const notParticiples =
    "indeed|red|bed|naked|sacred|wretched|hundred|wicked|hatred|kindred|" +
    "need|speed|greed|seed|deed|creed|feed|breed|tweed|" +
    "tired|talented|gifted|excited|interested|supposed";

  // get + adjective/inchoative idioms are not passive voice: "got married",
  // "got stuck", "got used to". Stacked on top of notParticiples, not
  // shared with the be-forms pattern, since "was used by" IS genuine passive.
  const getIdiomStoplist =
    "started|married|engaged|divorced|dressed|undressed|involved|worried|" +
    "stuck|lost|hurt|scared|bored|confused|used|acquainted|accustomed";

  // Single source of truth: partition the exported auxiliaryVerbs list by
  // get-prefix rather than duplicating a separate word list here. Matches
  // both the "get" stem (get/gets/getting) and the "got" stem (got/gotten)
  // — a plain startsWith("get") misses "got"/"gotten" since their second
  // letter is "o", not "e".
  const isGetForm = (v: string) => v.startsWith("get") || v.startsWith("got");
  const beForms = auxiliaryVerbs.filter(v => !isGetForm(v));
  const getForms = auxiliaryVerbs.filter(isGetForm);

  // \s+ (not literal spaces) so passives spanning a hard line wrap still
  // match. Up to two gap words (negation or -ly adverb) may sit between the
  // auxiliary and the participle: "was not fully fixed".
  const bePattern = new RegExp(
    `\\b(${beForms.join("|")})\\b\\s+(?:(?:not|never|\\w+ly)\\s+){0,2}(?!(?:${notParticiples})\\b)(${allVerbs})\\b`,
    "gi"
  );
  const getPattern = new RegExp(
    `\\b(${getForms.join("|")})\\b\\s+(?:(?:not|never|\\w+ly)\\s+){0,2}(?!(?:${notParticiples}|${getIdiomStoplist})\\b)(${allVerbs})\\b`,
    "gi"
  );

  let match;
  while ((match = bePattern.exec(text)) !== null) {
    if (advanceIfEmpty(bePattern, match)) continue;
    results.push({
      phrase: match[0],
      index: match.index,
      length: match[0].length,
    });
  }
  while ((match = getPattern.exec(text)) !== null) {
    if (advanceIfEmpty(getPattern, match)) continue;
    results.push({
      phrase: match[0],
      index: match.index,
      length: match[0].length,
    });
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

export function detectDuplicateWords(text: string): Array<{
  word: string;
  index: number;
  length: number;
}> {
  const results: Array<{ word: string; index: number; length: number }> = [];

  const regex = /(?<![\p{L}\p{N}_])([\p{L}\p{N}_]+)\s+(\1)(?![\p{L}\p{N}_])/giu;

  let match;
  while ((match = regex.exec(text)) !== null) {
    if (advanceIfEmpty(regex, match)) continue;
    // The backreference always ends the match, so its position is
    // deterministic — indexOf would find the FIRST word when cases match.
    const secondWordIndex = match.index + match[0].length - match[2].length;

    results.push({
      word: match[2],
      index: secondWordIndex,
      length: match[2].length,
    });

    // Resume at the duplicate so chained runs ("the the the") report each pair
    regex.lastIndex = secondWordIndex;
  }

  return results;
}

export function removeDuplicateWord(
  text: string,
  index: number,
  length: number
): string {
  let whitespaceStart = index;
  while (whitespaceStart > 0 && /\s/.test(text[whitespaceStart - 1])) {
    whitespaceStart--;
  }
  return text.substring(0, whitespaceStart) + text.substring(index + length);
}

/**
 * Remove every duplicate reported by a single detectDuplicateWords pass,
 * right-to-left so earlier indexes stay valid. Equivalent to the old
 * detect-remove-repeat loop without the quadratic rescans.
 */
export function fixDuplicateWords(text: string): { text: string; fixes: string[] } {
  const duplicates = detectDuplicateWords(text);
  let result = text;
  const fixes: string[] = [];
  for (let i = duplicates.length - 1; i >= 0; i--) {
    const d = duplicates[i];
    fixes.push(d.word);
    result = removeDuplicateWord(result, d.index, d.length);
  }
  fixes.reverse();
  return { text: result, fixes };
}

/**
 * Split text into sentences, preserving positions. Handles abbreviations,
 * decimals, ellipses, closing quotes/brackets after terminators, Markdown
 * block boundaries, and CRLF line endings. Shared by detectLongSentences and
 * the analyzer's sentence count so both report the same numbers.
 */
export function splitSentences(text: string): Array<{ text: string; index: number }> {
  const sentences: Array<{ text: string; index: number }> = [];
  if (!text.trim()) return sentences;

  let currentStart = 0;

  // Skip leading whitespace for first sentence
  while (currentStart < text.length && /\s/.test(text[currentStart])) {
    currentStart++;
  }

  let i = 0;
  while (i < text.length) {
    // Treat paragraph breaks (blank lines) and the start of a new list item
    // or blockquote as sentence boundaries. A Markdown block is not one long
    // running sentence just because it lacks terminal punctuation. (A single
    // '\n' inside a paragraph — soft-wrapped prose — is NOT a boundary.)
    // '\r' is tolerated so CRLF files split the same way as LF files.
    if (text[i] === '\n') {
      const rest = text.slice(i + 1);
      const isParagraphBreak = /^[ \t\r]*\n/.test(rest);
      const startsNewBlock = /^[ \t\r]*(?:[-*+]\s|\d+[.)]\s|>)/.test(rest);
      if (isParagraphBreak || startsNewBlock) {
        const sentenceText = text.substring(currentStart, i + 1).trim();
        if (sentenceText) sentences.push({ text: sentenceText, index: currentStart });
        i++;
        while (i < text.length && /\s/.test(text[i])) i++;
        currentStart = i;
        continue;
      }
    }
    if (text[i] === '.' || text[i] === '!' || text[i] === '?' || text[i] === '…') {
      // Check for ellipsis
      if (text[i] === '.' && text[i + 1] === '.' && text[i + 2] === '.') {
        i += 3;
        continue;
      }

      // Check for decimal number: digit.digit
      if (text[i] === '.' && i > 0 && /\d/.test(text[i - 1]) && i + 1 < text.length && /\d/.test(text[i + 1])) {
        i++;
        continue;
      }

      // Check for abbreviation. Walk back at most MAX_ABBREVIATION_LEN + 1
      // characters: anything longer cannot be an abbreviation.
      if (text[i] === '.') {
        const minStart = Math.max(0, i - (MAX_ABBREVIATION_LEN + 1));
        let wordStart = i - 1;
        while (wordStart >= minStart && /[a-zA-Z.]/.test(text[wordStart])) {
          wordStart--;
        }
        wordStart++;
        const wordBefore = text.substring(wordStart, i).toLowerCase().replace(/\.$/, '');
        if (abbreviations.has(wordBefore)) {
          i++;
          continue;
        }
      }

      // A terminator may be followed by closing quotes/brackets before the
      // whitespace: 'He said "Stop." Then he left.'
      let afterPunct = i + 1;
      while (afterPunct < text.length && /["'”’)\]]/.test(text[afterPunct])) {
        afterPunct++;
      }
      if (afterPunct >= text.length || /\s/.test(text[afterPunct])) {
        const sentenceText = text.substring(currentStart, afterPunct).trim();
        if (sentenceText) {
          sentences.push({ text: sentenceText, index: currentStart });
        }
        i = afterPunct;
        while (i < text.length && /\s/.test(text[i])) {
          i++;
        }
        currentStart = i;
        continue;
      }
    }
    i++;
  }

  // Handle remaining text (no terminal punctuation)
  if (currentStart < text.length) {
    const sentenceText = text.substring(currentStart).trim();
    if (sentenceText) {
      sentences.push({ text: sentenceText, index: currentStart });
    }
  }

  return sentences;
}

export function detectLongSentences(text: string, maxWords?: number): Array<{
  sentence: string;
  wordCount: number;
  index: number;
  length: number;
}> {
  const threshold = maxWords ?? 30;
  const results: Array<{ sentence: string; wordCount: number; index: number; length: number }> = [];

  for (const s of splitSentences(text)) {
    const words = s.text.split(/\s+/).filter(Boolean);
    if (words.length > threshold) {
      const display = s.text.replace(/\u0000+/g, ' ');
      const truncated = display.length > 50 ? display.substring(0, 50) + '...' : display;
      results.push({
        sentence: truncated,
        wordCount: words.length,
        index: s.index,
        length: s.text.length,
      });
    }
  }

  return results;
}

export function detectNominalizations(
  text: string,
  wordList?: Array<{ word: string; suggestion: string }>,
): Array<{
  word: string;
  suggestion: string;
  index: number;
  length: number;
}> {
  const results: Array<{ word: string; suggestion: string; index: number; length: number }> = [];
  const words = (wordList ?? defaultNominalizations).filter(w => w.word.trim() !== '');
  if (words.length === 0) return results;

  const pattern = new RegExp(
    `\\b(${words.map(w => escapeForRegex(w.word)).join("|")})\\b`,
    "gi"
  );

  const suggestionMap = new Map(words.map(w => [w.word.toLowerCase(), w.suggestion]));

  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (advanceIfEmpty(pattern, match)) continue;
    results.push({
      word: match[0],
      suggestion: suggestionMap.get(match[0].toLowerCase()) || '',
      index: match.index,
      length: match[0].length,
    });
  }

  return results;
}

export function detectHedging(text: string, phraseList?: string[]): Array<{
  phrase: string;
  index: number;
  length: number;
}> {
  const results: Array<{ phrase: string; index: number; length: number }> = [];
  const phrases = nonemptyStrings(phraseList ?? defaultHedgingPhrases);
  if (phrases.length === 0) return results;

  // Sort by length descending so longer phrases match first
  const sorted = [...phrases].sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`\\b(${sorted.map(flexibleSource).join("|")})\\b`, "gi");

  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (advanceIfEmpty(pattern, match)) continue;
    results.push({
      phrase: match[0],
      index: match.index,
      length: match[0].length,
    });
  }

  return results;
}

export function detectAdverbs(text: string, wordList?: string[]): Array<{
  word: string;
  index: number;
  length: number;
}> {
  const results: Array<{ word: string; index: number; length: number }> = [];
  const words = nonemptyStrings(wordList ?? defaultFillerAdverbs);
  if (words.length === 0) return results;

  const pattern = new RegExp(
    `\\b(${words.map(escapeForRegex).join("|")})\\b`,
    "gi"
  );

  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (advanceIfEmpty(pattern, match)) continue;
    results.push({
      word: match[0],
      index: match.index,
      length: match[0].length,
    });
  }

  return results;
}

// ─── AI Tells Detector ─────────────────────────────────────────────────────

/** Add \b only where the phrase edge is a word character — `\b` after "," never matches. */
function phraseRegex(phrase: string): RegExp {
  const lead = /^\w/.test(phrase) ? '\\b' : '';
  const trail = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(`${lead}${flexibleSource(phrase)}${trail}`, 'gi');
}

export function detectAiTells(
  text: string,
  vocabularyList?: Array<{ word: string; variants?: string[]; reason: string }>,
  phraseList?: Array<{ phrase: string; reason: string }>,
  patternList?: Array<{ name: string; pattern: string; reason: string }>,
): Array<{ text: string; index: number; length: number; reason: string }> {
  const results: Array<{ text: string; index: number; length: number; reason: string }> = [];
  const vocab = vocabularyList ?? defaultAiVocabulary;
  const phrases = phraseList ?? defaultAiPhrases;
  const patterns = patternList ?? defaultAiPatterns;

  // Markdown masking replaces masked regions with U+0000 sentinels so
  // index/length still map to the original text. A phrase or structural
  // match can span a masked region and capture sentinels into match[0]; strip
  // them from the *display* text only — index/length must stay untouched.
  const cleanSentinels = (s: string): string => s.replace(/\u0000+/g, ' ');

  // Vocabulary tells: whole-word matches, including inflected variants
  for (const { word, variants, reason } of vocab) {
    const forms = nonemptyStrings([word, ...(variants ?? [])]).map(escapeForRegex);
    if (forms.length === 0) continue;
    const regex = new RegExp(`\\b(?:${forms.join('|')})\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (advanceIfEmpty(regex, match)) continue;
      results.push({
        text: cleanSentinels(match[0]),
        index: match.index,
        length: match[0].length,
        reason,
      });
    }
  }

  // Phrase tells: case-insensitive whole-phrase matches
  for (const { phrase, reason } of phrases) {
    if (phrase.trim() === '') continue;
    const regex = phraseRegex(phrase);
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (advanceIfEmpty(regex, match)) continue;
      results.push({
        text: cleanSentinels(match[0]),
        index: match.index,
        length: match[0].length,
        reason,
      });
      // Allow overlapping re-scan from the next character
      regex.lastIndex = match.index + 1;
    }
  }

  // Structural tells: regex patterns for constructions, not literal strings
  for (const { pattern, reason } of patterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'gi');
    } catch {
      continue; // an unsupported/invalid pattern must not take down the analyzer
    }
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        text: cleanSentinels(match[0]),
        index: match.index,
        length: match[0].length,
        reason,
      });
      if (match[0].length === 0) regex.lastIndex++; // safety against zero-width matches
    }
  }

  // A span contained inside a longer match is the same finding reported twice
  // ("delve" inside "let's delve") — keep only the outermost match. Sorting by
  // index then length-descending guarantees any covering match precedes the
  // matches it covers, so one forward pass suffices.
  results.sort((a, b) => a.index - b.index || b.length - a.length);
  const kept: typeof results = [];
  for (const r of results) {
    const covered = kept.some(k => k.index <= r.index && k.index + k.length >= r.index + r.length);
    if (!covered) kept.push(r);
  }
  return kept;
}
