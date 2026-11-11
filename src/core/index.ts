export {
  detectWeaselWords, detectPassiveVoice, detectDuplicateWords, removeDuplicateWord,
  fixDuplicateWords,
  detectLongSentences, detectNominalizations, detectHedging, detectAdverbs,
  detectAiTells, splitSentences,
} from './detector.js';
export {
  allWeaselWords, irregularVerbs, auxiliaryVerbs,
  nominalizations, hedgingPhrases, fillerAdverbs, abbreviations,
  aiTellsVocabulary, aiTellsPhrases, aiTellsPatterns,
} from './words.js';
export { analyzeText } from './analyzer.js';
export type { AnalysisResult, AnalyzeOptions } from './analyzer.js';
export { maskMarkdown, isMarkdownFile } from './markdown.js';
export { makeLineIndex } from './linecol.js';
export type { LineCol } from './linecol.js';
export {
  mergeConfig, applyWordListOverrides, applyNominalizationOverrides,
  applyAiTellsVocabOverrides, applyAiTellsPhraseOverrides, applyAiTellsPatternOverrides,
  validateConfig, DEFAULT_CONFIG,
} from './config.js';
export type {
  WscConfig, DetectorConfig, WordListDetectorConfig,
  NominalizationDetectorConfig, LongSentenceDetectorConfig,
  AiTellsDetectorConfig,
} from './config.js';
