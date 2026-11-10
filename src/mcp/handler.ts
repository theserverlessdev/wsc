import {
  detectDuplicateWords,
  removeDuplicateWord,
  allWeaselWords,
  nominalizations,
  hedgingPhrases,
  fillerAdverbs,
  irregularVerbs,
  aiTellsVocabulary,
  aiTellsPhrases,
  aiTellsPatterns,
  analyzeText,
  validateConfig,
} from '../core';
import type { WscConfig } from '../core';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS = [
  {
    name: 'check_text',
    title: 'Check text for writing style issues',
    description:
      'Analyze text for writing style issues: weasel words, passive voice, duplicate words, long sentences, nominalizations, hedging, filler adverbs, and research-cited AI tells. Read-only and stateless — text is analyzed in memory on the hosted server and never stored. Returns a plain-text report with each issue\'s line and column, the matched text, surrounding context, and the reason for AI tells; texts over 100,000 characters return an error message. This hosted server has no filesystem access — the wsc-mcp npm package adds a check_file tool for local files. It only reports issues — to auto-remove duplicate words, follow up with fix_duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to analyze for writing style issues',
        },
        config: {
          type: 'object',
          description: 'Optional config to enable/disable detectors or add/remove word-list entries; same schema as .wscrc.json (https://wsc.theserverless.dev/schema.json)',
        },
        format: {
          type: 'string',
          enum: ['plain', 'markdown'],
          description: 'Set to "markdown" to mask code blocks, inline code, tables, and headings so they are not linted as prose; default "plain" lints everything',
        },
      },
      required: ['text'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'fix_duplicates',
    title: 'Remove duplicate adjacent words',
    description:
      'Remove duplicate adjacent words (case-insensitive, including across line breaks) and return the cleaned text plus the list of words that were removed. Read-only with no side effects: the fix is returned in the response, nothing is written anywhere. Use after check_text reports duplicate words; other issue types are report-only and have no auto-fix.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to clean by removing duplicate adjacent words',
        },
      },
      required: ['text'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_word_lists',
    title: 'List detector word lists',
    description:
      'Return every detector word/phrase list with its entry count, config key, and sample entries, plus a link to the full browsable library. Read-only, takes no parameters, and returns the same catalog for a given release. Use it to see what the detectors match before tuning a config for check_text; not needed for ordinary checking.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const MAX_TEXT_LENGTH = 100_000;

function getLineCol(text: string, index: number) {
  const lines = text.substring(0, index).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function getContext(text: string, index: number, length: number) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.substring(start, end)}${suffix}`;
}

function handleCheckText(args: Record<string, unknown>): { content: Array<{ type: string; text: string }> } {
  const text = args.text as string;
  if (!text || typeof text !== 'string') {
    throw { code: -32602, message: 'Missing or invalid "text" argument' };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw { code: -32602, message: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` };
  }

  let config: WscConfig | undefined;
  if (args.config !== undefined) {
    const errors = validateConfig(args.config);
    if (errors.length > 0) {
      throw { code: -32602, message: `Invalid config: ${errors.join('; ')}` };
    }
    config = args.config as WscConfig;
  }

  const format = args.format;
  if (format !== undefined && format !== 'markdown' && format !== 'plain') {
    throw { code: -32602, message: 'Invalid "format": must be "markdown" or "plain"' };
  }

  const result = analyzeText(text, config, { markdown: format === 'markdown' });
  const { summary, issues, meta } = result;

  let output = `Writing Style Analysis\n======================\n`;

  if (summary.total === 0) {
    output += `No issues found in ${meta.characterCount} characters (${meta.wordCount} words). Nice work!\n`;
  } else {
    output += `Found ${summary.total} issue${summary.total !== 1 ? 's' : ''} in ${meta.characterCount} characters (${meta.wordCount} words)\n`;

    const sections: Array<{ label: string; items: Array<{ display: string; index: number; length: number }> }> = [
      { label: 'WEASEL WORDS', items: issues.weaselWords.map(w => ({ display: w.word, ...w })) },
      { label: 'PASSIVE VOICE', items: issues.passiveVoice.map(p => ({ display: p.phrase, ...p })) },
      { label: 'DUPLICATE WORDS', items: issues.duplicateWords.map(d => ({ display: d.word, ...d })) },
      { label: 'LONG SENTENCES', items: issues.longSentences.map(s => ({ display: `${s.sentence} (${s.wordCount} words)`, ...s })) },
      { label: 'NOMINALIZATIONS', items: issues.nominalizations.map(n => ({ display: `${n.word} → ${n.suggestion}`, ...n })) },
      { label: 'HEDGING', items: issues.hedging.map(h => ({ display: h.phrase, ...h })) },
      { label: 'FILLER ADVERBS', items: issues.adverbs.map(a => ({ display: a.word, ...a })) },
      { label: 'AI TELLS', items: issues.aiTells.map(a => ({ display: `${a.text} — ${a.reason}`, ...a })) },
    ];

    for (const section of sections) {
      if (section.items.length > 0) {
        output += `\n${section.label} (${section.items.length}):\n`;
        for (const item of section.items) {
          const { line, column } = getLineCol(text, item.index);
          const context = getContext(text, item.index, item.length);
          output += `  - "${item.display}" at line ${line}, column ${column}\n    Context: ${context}\n`;
        }
      }
    }
  }

  return { content: [{ type: 'text', text: output }] };
}

function handleFixDuplicates(args: Record<string, unknown>): { content: Array<{ type: string; text: string }> } {
  let text = args.text as string;
  if (!text || typeof text !== 'string') {
    throw { code: -32602, message: 'Missing or invalid "text" argument' };
  }

  const fixes: string[] = [];
  let duplicates = detectDuplicateWords(text);

  while (duplicates.length > 0) {
    const d = duplicates[duplicates.length - 1];
    fixes.push(d.word);
    text = removeDuplicateWord(text, d.index, d.length);
    duplicates = detectDuplicateWords(text);
  }

  let output: string;
  if (fixes.length === 0) {
    output = `No duplicate words found. Text is clean.\n\n${text}`;
  } else {
    output = `Removed ${fixes.length} duplicate word${fixes.length !== 1 ? 's' : ''}: ${fixes.reverse().join(', ')}\n\nCleaned text:\n${text}`;
  }

  return { content: [{ type: 'text', text: output }] };
}

function handleListWordLists(): { content: Array<{ type: string; text: string }> } {
  const lists = [
    { name: 'Weasel Words', count: allWeaselWords.length, configKey: 'weaselWords', sample: allWeaselWords.slice(0, 10) },
    { name: 'Irregular Verbs (Passive Voice)', count: irregularVerbs.length, configKey: 'passiveVoice', sample: irregularVerbs.slice(0, 10) },
    { name: 'Nominalizations', count: nominalizations.length, configKey: 'nominalizations', sample: nominalizations.slice(0, 5).map(n => `${n.word} → ${n.suggestion}`) },
    { name: 'Hedging Phrases', count: hedgingPhrases.length, configKey: 'hedging', sample: hedgingPhrases.slice(0, 10) },
    { name: 'Filler Adverbs', count: fillerAdverbs.length, configKey: 'adverbs', sample: fillerAdverbs.slice(0, 10) },
    { name: 'AI Tells (Vocabulary)', count: aiTellsVocabulary.length, configKey: 'aiTells', sample: aiTellsVocabulary.slice(0, 10).map(v => v.word) },
    { name: 'AI Tells (Phrases)', count: aiTellsPhrases.length, configKey: 'aiTells', sample: aiTellsPhrases.slice(0, 10).map(p => p.phrase) },
    { name: 'AI Tells (Structural Patterns)', count: aiTellsPatterns.length, configKey: 'aiTells', sample: aiTellsPatterns.slice(0, 10).map(p => p.name) },
  ];

  const lines = [
    'Detector Word Lists',
    '===================',
    '',
  ];

  for (const list of lists) {
    lines.push(`${list.name} (${list.count} entries) [config: detectors.${list.configKey}]`);
    lines.push(`  Sample: ${list.sample.join(', ')}`);
    lines.push('');
  }

  lines.push('All 8 detectors are enabled by default. Use the config parameter in check_text to customize.');
  lines.push('Word lists can be customized with add/remove overrides in .wscrc.json config files.');
  lines.push('Browse the full lists at: https://wsc.theserverless.dev/words');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleMcpRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { jsonrpc, id, method, params } = request;

  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: id ?? 0, error: { code: -32600, message: 'Invalid JSON-RPC version' } };
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'writing-style-checker',
            // release-please sets this from the wsc-mcp component
            version: '2.2.2', // x-release-please-version
          },
        },
      };

    case 'notifications/initialized':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call': {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const args = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;

      try {
        let result;
        switch (toolName) {
          case 'check_text':
            result = handleCheckText(args);
            break;
          case 'fix_duplicates':
            result = handleFixDuplicates(args);
            break;
          case 'list_word_lists':
            result = handleListWordLists();
            break;
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: `Unknown tool: ${toolName}` },
            };
        }
        return { jsonrpc: '2.0', id, result };
      } catch (err: unknown) {
        const error = err as { code?: number; message?: string };
        if (error.code && error.message) {
          return { jsonrpc: '2.0', id, error: { code: error.code, message: error.message } };
        }
        return { jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}
