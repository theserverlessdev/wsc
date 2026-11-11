import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AnalyzeOptions } from '../src/core/index.js';
import {
  fixDuplicateWords,
  allWeaselWords,
  nominalizations,
  hedgingPhrases,
  fillerAdverbs,
  irregularVerbs,
  aiTellsVocabulary,
  aiTellsPhrases,
  aiTellsPatterns,
  analyzeText as coreAnalyzeText,
  validateConfig,
  makeLineIndex,
} from '../src/core/index.js';
import type { WscConfig } from '../src/core/index.js';
import { findConfigFile, loadConfigFromFile, readPackageVersion } from '../src/core/config-node.js';
import { isMarkdownFile } from '../src/core/markdown.js';

const MAX_TEXT_LENGTH = 100_000;

export function getLineCol(text: string, index: number) {
  return makeLineIndex(text)(index);
}

export function getContext(text: string, index: number, length: number) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.substring(start, end)}${suffix}`;
}

export function formatAnalysis(text: string, config?: WscConfig, options?: AnalyzeOptions): string {
  const result = coreAnalyzeText(text, config, options);
  const { summary, issues, meta } = result;
  const getLineColFor = makeLineIndex(text);

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
          const { line, column } = getLineColFor(item.index);
          const context = getContext(text, item.index, item.length);
          output += `  - "${item.display}" at line ${line}, column ${column}\n    Context: ${context}\n`;
        }
      }
    }
  }

  return output;
}

// Keep backward compatibility — old name used in tests
export const analyzeText = formatAnalysis;

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'writing-style-checker',
    // keep in step with wsc-mcp releases
    version: readPackageVersion(import.meta.url, 'wsc-mcp'),
  });

  server.registerTool(
    'check_text',
    {
      title: 'Check text for writing style issues',
      description:
        'Analyze text for writing style issues: weasel words, passive voice, duplicate words, long sentences, nominalizations, hedging, filler adverbs, and research-cited AI tells. Read-only and stateless — text is analyzed in memory, never stored. Returns a plain-text report with each issue\'s line and column, the matched text, surrounding context, and the reason for AI tells; texts over 100,000 characters return an error message. Use this for text already in the conversation; use check_file for files on disk. It only reports issues — to auto-remove duplicate words, follow up with fix_duplicates.',
      inputSchema: {
        text: z.string().describe('The text to analyze for writing style issues'),
        config: z.record(z.string(), z.unknown()).optional().describe('Optional config to enable/disable detectors or add/remove word-list entries; same schema as .wscrc.json (https://wsc.theserverless.dev/schema.json)'),
        format: z.enum(['plain', 'markdown']).optional().describe('Set to "markdown" to mask code blocks, inline code, tables, and headings so they are not linted as prose; default "plain" lints everything'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ text, config: rawConfig, format }) => {
      if (text.length > MAX_TEXT_LENGTH) {
        return { content: [{ type: 'text', text: `Error: Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }] };
      }
      let config: WscConfig | undefined;
      if (rawConfig !== undefined) {
        const errors = validateConfig(rawConfig);
        if (errors.length > 0) {
          return { content: [{ type: 'text', text: `Error: Invalid config - ${errors.join('; ')}` }] };
        }
        config = rawConfig as WscConfig;
      }
      return { content: [{ type: 'text', text: formatAnalysis(text, config, { markdown: format === 'markdown' }) }] };
    }
  );

  server.registerTool(
    'fix_duplicates',
    {
      title: 'Remove duplicate adjacent words',
      description:
        'Remove duplicate adjacent words (case-insensitive, including across line breaks) and return the cleaned text plus the list of words that were removed. Read-only with no side effects: the fix is returned in the response, nothing is written anywhere. Use after check_text or check_file reports duplicate words; other issue types are report-only and have no auto-fix.',
      inputSchema: { text: z.string().describe('The text to clean by removing duplicate adjacent words') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ text }) => {
      const { text: cleaned, fixes } = fixDuplicateWords(text);

      let output: string;
      if (fixes.length === 0) {
        output = `No duplicate words found. Text is clean.\n\n${cleaned}`;
      } else {
        output = `Removed ${fixes.length} duplicate word${fixes.length !== 1 ? 's' : ''}: ${fixes.join(', ')}\n\nCleaned text:\n${cleaned}`;
      }

      return { content: [{ type: 'text', text: output }] };
    }
  );

  server.registerTool(
    'list_word_lists',
    {
      title: 'List detector word lists',
      description:
        'Return every detector word/phrase list with its entry count, config key, and sample entries, plus a link to the full browsable library. Read-only, takes no parameters, and returns the same catalog for a given release. Use it to see what the detectors match before tuning a config for check_text or check_file; not needed for ordinary checking.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
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
      const lines = ['Detector Word Lists', '===================', ''];
      for (const list of lists) {
        lines.push(`${list.name} (${list.count} entries) [config: detectors.${list.configKey}]`);
        lines.push(`  Sample: ${list.sample.join(', ')}`);
        lines.push('');
      }
      lines.push('All 8 detectors are enabled by default.');
      lines.push('Browse the full lists at: https://wsc.theserverless.dev/words');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.registerTool(
    'check_file',
    {
      title: 'Check a file for writing style issues',
      description:
        'Read a UTF-8 file from local disk and analyze it for the same writing style issues as check_text (weasel words, passive voice, hedging, AI tells, and more). Read-only: the file is never modified, and Markdown files are automatically masked so code blocks and tables are not linted as prose. A .wscrc.json config is auto-discovered from the file\'s directory upward unless config is passed explicitly. Returns the same line-and-column report as check_text, or an error message for unreadable or oversized (over 100,000 characters) files. Use when the text lives on disk; use check_text for text already in the conversation.',
      inputSchema: {
        path: z.string().describe('Absolute or relative path to the file to analyze; read as UTF-8'),
        config: z.record(z.string(), z.unknown()).optional().describe('Optional config (same schema as .wscrc.json); when set, auto-discovery of .wscrc.json is skipped'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, config: rawConfig }) => {
      try {
        const text = await readFile(path, 'utf-8');
        if (text.length > MAX_TEXT_LENGTH) {
          return { content: [{ type: 'text', text: `Error: File exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }] };
        }

        let config: WscConfig | undefined;
        if (rawConfig !== undefined) {
          const errors = validateConfig(rawConfig);
          if (errors.length > 0) {
            return { content: [{ type: 'text', text: `Error: Invalid config - ${errors.join('; ')}` }] };
          }
          config = rawConfig as WscConfig;
        } else {
          // Auto-discover .wscrc.json
          const configPath = await findConfigFile(dirname(path));
          if (configPath) {
            config = await loadConfigFromFile(configPath);
          }
        }

        const markdown = isMarkdownFile(path);
        return { content: [{ type: 'text', text: `File: ${path}\n\n${formatAnalysis(text, config, { markdown })}` }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error reading file: ${message}` }] };
      }
    }
  );

  return server;
}
