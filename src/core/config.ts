// === Types ===

export interface DetectorConfig {
  enabled?: boolean;
}

export interface WordListDetectorConfig extends DetectorConfig {
  add?: string[];
  remove?: string[];
}

export interface NominalizationDetectorConfig extends DetectorConfig {
  add?: Array<{ word: string; suggestion: string }>;
  remove?: string[];
}

export interface LongSentenceDetectorConfig extends DetectorConfig {
  maxWords?: number;
}

export interface AiTellsDetectorConfig extends DetectorConfig {
  add?: string[];
  remove?: string[];
  addPhrases?: string[];
  removePhrases?: string[];
  /** Names of built-in structural patterns to disable (see aiTellsPatterns in words.ts). */
  removePatterns?: string[];
}

export interface WscConfig {
  $schema?: string;
  /** Glob patterns (relative to the working dir) to exclude from checking. */
  ignore?: string[];
  detectors?: {
    weaselWords?: WordListDetectorConfig;
    passiveVoice?: DetectorConfig;
    duplicateWords?: DetectorConfig;
    longSentences?: LongSentenceDetectorConfig;
    nominalizations?: NominalizationDetectorConfig;
    hedging?: WordListDetectorConfig;
    adverbs?: WordListDetectorConfig;
    aiTells?: AiTellsDetectorConfig;
  };
}

// === Defaults ===

export const DEFAULT_CONFIG: Required<Pick<WscConfig, 'detectors'>> & WscConfig = {
  detectors: {
    weaselWords: { enabled: true },
    passiveVoice: { enabled: true },
    duplicateWords: { enabled: true },
    longSentences: { enabled: true, maxWords: 30 },
    nominalizations: { enabled: true },
    hedging: { enabled: true },
    adverbs: { enabled: true },
    aiTells: { enabled: true },
  },
};

const KNOWN_TOP_LEVEL_KEYS = new Set(['$schema', 'detectors', 'ignore']);
const KNOWN_DETECTOR_NAMES = new Set([
  'weaselWords', 'passiveVoice', 'duplicateWords',
  'longSentences', 'nominalizations', 'hedging', 'adverbs', 'aiTells',
]);
const WORD_LIST_DETECTORS = new Set(['weaselWords', 'hedging', 'adverbs']);
const BASE_DETECTOR_KEYS = new Set(['enabled']);
const WORD_LIST_DETECTOR_KEYS = new Set(['enabled', 'add', 'remove']);
const LONG_SENTENCE_KEYS = new Set(['enabled', 'maxWords']);
const NOMINALIZATION_KEYS = new Set(['enabled', 'add', 'remove']);
const AI_TELLS_KEYS = new Set(['enabled', 'add', 'remove', 'addPhrases', 'removePhrases', 'removePatterns']);

// === Functions ===

export function mergeConfig(userConfig?: WscConfig): Required<Pick<WscConfig, 'detectors'>> & WscConfig {
  if (!userConfig || !userConfig.detectors) {
    return structuredClone(DEFAULT_CONFIG);
  }

  const merged = structuredClone(DEFAULT_CONFIG);
  const detectors = userConfig.detectors;

  for (const key of KNOWN_DETECTOR_NAMES) {
    const detectorKey = key as keyof typeof detectors;
    if (detectors[detectorKey] !== undefined) {
      merged.detectors[detectorKey] = {
        ...merged.detectors[detectorKey],
        ...structuredClone(detectors[detectorKey]),
      } as any;
    }
  }

  return merged;
}

export function applyWordListOverrides(
  baseList: string[],
  add?: string[],
  remove?: string[],
): string[] {
  let result = [...baseList];

  if (remove && remove.length > 0) {
    const removeLower = new Set(remove.map(w => w.toLowerCase()));
    result = result.filter(w => !removeLower.has(w.toLowerCase()));
  }

  if (add && add.length > 0) {
    const existingLower = new Set(result.map(w => w.toLowerCase()));
    for (const word of add) {
      if (!existingLower.has(word.toLowerCase())) {
        result.push(word);
        existingLower.add(word.toLowerCase());
      }
    }
  }

  return result;
}

export function applyNominalizationOverrides(
  baseList: Array<{ word: string; suggestion: string }>,
  add?: Array<{ word: string; suggestion: string }>,
  remove?: string[],
): Array<{ word: string; suggestion: string }> {
  let result = baseList.map(item => ({ ...item }));

  if (remove && remove.length > 0) {
    const removeLower = new Set(remove.map(w => w.toLowerCase()));
    result = result.filter(item => !removeLower.has(item.word.toLowerCase()));
  }

  if (add && add.length > 0) {
    const existingLower = new Set(result.map(item => item.word.toLowerCase()));
    for (const item of add) {
      if (!existingLower.has(item.word.toLowerCase())) {
        result.push({ ...item });
        existingLower.add(item.word.toLowerCase());
      }
    }
  }

  return result;
}

export function applyAiTellsVocabOverrides(
  baseList: Array<{ word: string; variants?: string[]; reason: string }>,
  add?: string[],
  remove?: string[],
): Array<{ word: string; variants?: string[]; reason: string }> {
  let result = baseList.map(item => ({ ...item }));

  if (remove && remove.length > 0) {
    const removeLower = new Set(remove.map(w => w.toLowerCase()));
    result = result.filter(item => !removeLower.has(item.word.toLowerCase()));
  }

  if (add && add.length > 0) {
    const existingLower = new Set(result.map(item => item.word.toLowerCase()));
    for (const word of add) {
      if (!existingLower.has(word.toLowerCase())) {
        result.push({ word, reason: `"${word}" flagged as AI vocabulary (custom rule)` });
        existingLower.add(word.toLowerCase());
      }
    }
  }

  return result;
}

export function applyAiTellsPhraseOverrides(
  baseList: Array<{ phrase: string; reason: string }>,
  add?: string[],
  remove?: string[],
): Array<{ phrase: string; reason: string }> {
  let result = baseList.map(item => ({ ...item }));

  if (remove && remove.length > 0) {
    const removeLower = new Set(remove.map(p => p.toLowerCase()));
    result = result.filter(item => !removeLower.has(item.phrase.toLowerCase()));
  }

  if (add && add.length > 0) {
    const existingLower = new Set(result.map(item => item.phrase.toLowerCase()));
    for (const phrase of add) {
      if (!existingLower.has(phrase.toLowerCase())) {
        result.push({ phrase, reason: `"${phrase}" flagged as AI phrase (custom rule)` });
        existingLower.add(phrase.toLowerCase());
      }
    }
  }

  return result;
}

export function applyAiTellsPatternOverrides(
  baseList: Array<{ name: string; pattern: string; reason: string }>,
  remove?: string[],
): Array<{ name: string; pattern: string; reason: string }> {
  if (!remove || remove.length === 0) return baseList.map(item => ({ ...item }));
  const removeLower = new Set(remove.map(n => n.toLowerCase()));
  return baseList
    .filter(item => !removeLower.has(item.name.toLowerCase()))
    .map(item => ({ ...item }));
}

export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    errors.push('Config must be a JSON object');
    return errors;
  }

  const obj = config as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`Unknown top-level key: "${key}"`);
    }
  }

  if (obj.$schema !== undefined && typeof obj.$schema !== 'string') {
    errors.push('"$schema" must be a string');
  }

  if (obj.ignore !== undefined) {
    if (!Array.isArray(obj.ignore) || !obj.ignore.every((v: unknown) => typeof v === 'string')) {
      errors.push('"ignore" must be an array of strings');
    }
  }

  if (obj.detectors === undefined) return errors;

  if (typeof obj.detectors !== 'object' || obj.detectors === null || Array.isArray(obj.detectors)) {
    errors.push('"detectors" must be an object');
    return errors;
  }

  const detectors = obj.detectors as Record<string, unknown>;

  for (const name of Object.keys(detectors)) {
    if (!KNOWN_DETECTOR_NAMES.has(name)) {
      errors.push(`Unknown detector: "${name}"`);
      continue;
    }

    const det = detectors[name];
    if (typeof det !== 'object' || det === null || Array.isArray(det)) {
      errors.push(`detectors.${name} must be an object`);
      continue;
    }

    const detObj = det as Record<string, unknown>;

    let allowedKeys: Set<string>;
    if (name === 'longSentences') {
      allowedKeys = LONG_SENTENCE_KEYS;
    } else if (name === 'nominalizations') {
      allowedKeys = NOMINALIZATION_KEYS;
    } else if (name === 'aiTells') {
      allowedKeys = AI_TELLS_KEYS;
    } else if (WORD_LIST_DETECTORS.has(name)) {
      allowedKeys = WORD_LIST_DETECTOR_KEYS;
    } else {
      allowedKeys = BASE_DETECTOR_KEYS;
    }

    for (const key of Object.keys(detObj)) {
      if (!allowedKeys.has(key)) {
        errors.push(`Unknown key in detectors.${name}: "${key}"`);
      }
    }

    if (detObj.enabled !== undefined && typeof detObj.enabled !== 'boolean') {
      errors.push(`detectors.${name}.enabled must be a boolean`);
    }

    if (name === 'longSentences' && detObj.maxWords !== undefined) {
      if (typeof detObj.maxWords !== 'number' || !Number.isInteger(detObj.maxWords) || detObj.maxWords <= 0) {
        errors.push(`detectors.${name}.maxWords must be a positive integer`);
      }
    }

    if (WORD_LIST_DETECTORS.has(name)) {
      if (detObj.add !== undefined) {
        if (!Array.isArray(detObj.add) || !detObj.add.every((v: unknown) => typeof v === 'string')) {
          errors.push(`detectors.${name}.add must be an array of strings`);
        } else {
          for (let i = 0; i < detObj.add.length; i++) {
            if (!(detObj.add[i] as string).trim()) {
              errors.push(`detectors.${name}.add[${i}] must be a non-empty string`);
            }
          }
        }
      }
      if (detObj.remove !== undefined) {
        if (!Array.isArray(detObj.remove) || !detObj.remove.every((v: unknown) => typeof v === 'string')) {
          errors.push(`detectors.${name}.remove must be an array of strings`);
        }
      }
    }

    if (name === 'aiTells') {
      for (const field of ['add', 'remove', 'addPhrases', 'removePhrases', 'removePatterns']) {
        if (detObj[field] !== undefined) {
          if (!Array.isArray(detObj[field]) || !(detObj[field] as unknown[]).every((v: unknown) => typeof v === 'string')) {
            errors.push(`detectors.${name}.${field} must be an array of strings`);
          } else if (field === 'add' || field === 'addPhrases') {
            const arr = detObj[field] as string[];
            for (let i = 0; i < arr.length; i++) {
              if (!arr[i].trim()) {
                errors.push(`detectors.${name}.${field}[${i}] must be a non-empty string`);
              }
            }
          }
        }
      }
    }

    if (name === 'nominalizations') {
      if (detObj.add !== undefined) {
        if (!Array.isArray(detObj.add)) {
          errors.push(`detectors.${name}.add must be an array`);
        } else {
          for (let i = 0; i < detObj.add.length; i++) {
            const item = detObj.add[i] as unknown;
            if (typeof item !== 'object' || item === null || Array.isArray(item)) {
              errors.push(`detectors.${name}.add[${i}] must be an object with "word" and "suggestion"`);
              continue;
            }
            const entry = item as Record<string, unknown>;
            if (typeof entry.word !== 'string' || !entry.word) {
              errors.push(`detectors.${name}.add[${i}].word must be a non-empty string`);
            }
            if (typeof entry.suggestion !== 'string' || !entry.suggestion) {
              errors.push(`detectors.${name}.add[${i}].suggestion must be a non-empty string`);
            }
          }
        }
      }
      if (detObj.remove !== undefined) {
        if (!Array.isArray(detObj.remove) || !detObj.remove.every((v: unknown) => typeof v === 'string')) {
          errors.push(`detectors.${name}.remove must be an array of strings`);
        }
      }
    }
  }

  return errors;
}
