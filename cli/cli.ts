import { cac } from 'cac';
import pico from 'picocolors';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { glob } from 'tinyglobby';
import { analyzeText } from '../src/core/analyzer.js';
import { allWeaselWords, hedgingPhrases, fillerAdverbs, nominalizations, aiTellsVocabulary, aiTellsPhrases, aiTellsPatterns } from '../src/core/words.js';
import { findConfigFile, loadConfigFromFile, readPackageVersion } from '../src/core/config-node.js';
import { mergeConfig } from '../src/core/config.js';
import type { WscConfig } from '../src/core/config.js';
import { formatTextWithLineCol, formatJson, formatGitHub, formatSummary } from './formatter.js';
import { isMarkdownFile } from '../src/core/markdown.js';
import type { AnalysisResult } from '../src/core/analyzer.js';
import { buildIgnoreList } from './ignore.js';

export async function run(argv: string[] = process.argv): Promise<number> {
  const cli = cac('wsc');

  // cac discards the return value of an .action() callback, so we cannot use
  // it to drive the process exit code. Capture the intended code here instead.
  let resultCode = 0;

  cli.command('check [...files]', 'Check files for writing style issues')
    .option('--config <path>', 'Path to .wscrc.json config file')
    .option('--ignore <patterns>', 'Glob patterns to skip (comma or newline separated). Stacks with config ignore')
    .option('--format <format>', 'Output format: text, json, github', { default: 'text' })
    .option('--no-color', 'Disable colored output')
    .option('--quiet', 'Only show summary')
    .option('--max-warnings <n>', 'Fail (exit 1) when issue count exceeds N; -1 (default) never fails', { default: -1 })
    .option('--no-markdown', 'Lint raw text; do not mask Markdown code blocks, inline code, and tables')
    .option('--stdin', 'Read from stdin instead of files')
    .action(async (files: string[], options: any) => {
      if (!['text', 'json', 'github'].includes(options.format)) {
        process.stderr.write(`Error: Unknown format "${options.format}". Valid formats: text, json, github.\n`);
        resultCode = 2;
        return;
      }
      // FORCE_COLOR is re-read here (not just at picocolors import time) so
      // color can be forced per invocation; picocolors resolves separately
      // under cli/node_modules and root node_modules, so its import-time
      // detection is not reachable from the test suite.
      const forceColor = !!process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0';
      const useColor = options.color !== false && (forceColor || pico.isColorSupported);
      // json/github output must stay uncolored regardless of TTY/--no-color;
      // only the plain-text summary line gets painted.
      const summaryColor = options.format === 'text' && useColor;

      let config: WscConfig | undefined;

      if (options.config) {
        config = await loadConfigFromFile(resolve(options.config));
      }

      if (options.stdin) {
        const text = await readStdin();
        if (!config) {
          const configPath = await findConfigFile(process.cwd());
          if (configPath) config = await loadConfigFromFile(configPath);
        }
        const result = analyzeText(text, config, { markdown: options.markdown !== false });
        if (!options.quiet) {
          if (options.format === 'json') {
            process.stdout.write(formatJson([{ path: '<stdin>', result }]) + '\n');
          } else if (options.format === 'github') {
            const output = formatGitHub('<stdin>', text, result);
            if (output) process.stdout.write(output + '\n');
          } else {
            const output = formatTextWithLineCol('<stdin>', text, result, useColor);
            if (output) process.stdout.write(output + '\n');
          }
        }
        process.stdout.write(formatSummary(result.summary.total, 1, summaryColor) + '\n');
        resultCode = exitCode(result.summary.total, options.maxWarnings);
        return;
      }

      if (!files || files.length === 0) {
        process.stderr.write('Error: No files specified. Use --stdin to read from stdin.\n');
        resultCode = 2;
        return;
      }

      // Resolve `ignore` globs from the root config (--config or the nearest
      // .wscrc.json at the cwd), plus CLI `--ignore` / Action `exclude`.
      // These stack (union). node_modules / .git are always skipped.
      let rootConfig = config;
      if (!rootConfig) {
        const rootConfigPath = await findConfigFile(process.cwd());
        if (rootConfigPath) rootConfig = await loadConfigFromFile(rootConfigPath);
      }
      const ignore = buildIgnoreList(rootConfig?.ignore, options.ignore);

      // node_modules / .git are ignored by default so `**/*.md` behaves like
      // every other linter and never sweeps in dependency docs.
      const resolvedFiles = await glob(files, {
        cwd: process.cwd(),
        absolute: true,
        ignore,
      });
      if (resolvedFiles.length === 0) {
        // Files matched but every one is ignored (e.g. an only-changed PR
        // that touches just excluded files): nothing to check, not an error.
        const unfiltered = await glob(files, { cwd: process.cwd(), ignore: buildIgnoreList() });
        if (unfiltered.length > 0) {
          process.stderr.write('All matched files are ignored; nothing to check.\n');
          if (options.format === 'json') {
            if (!options.quiet) process.stdout.write(formatJson([]) + '\n');
          } else {
            process.stdout.write(formatSummary(0, 0, summaryColor) + '\n');
          }
          return;
        }
        process.stderr.write('Error: No files matched the given patterns.\n');
        resultCode = 2;
        return;
      }

      let totalIssues = 0;
      const jsonResults: Array<{ path: string; result: AnalysisResult }> = [];

      for (const filePath of resolvedFiles) {
        const text = await readFile(filePath, 'utf-8');

        let fileConfig = config;
        if (!fileConfig) {
          const configPath = await findConfigFile(dirname(filePath));
          if (configPath) fileConfig = await loadConfigFromFile(configPath);
        }

        // Mask Markdown structure (code/tables) before analysis; the original
        // text is still used for formatting so line/col stay correct.
        const result = analyzeText(text, fileConfig, {
          markdown: isMarkdownFile(filePath) && options.markdown !== false,
        });
        totalIssues += result.summary.total;

        if (options.format === 'json') {
          jsonResults.push({ path: filePath, result });
        } else if (!options.quiet && result.summary.total > 0) {
          if (options.format === 'github') {
            process.stdout.write(formatGitHub(filePath, text, result) + '\n');
          } else {
            process.stdout.write(formatTextWithLineCol(filePath, text, result, useColor) + '\n');
          }
        }
      }

      if (options.format === 'json' && !options.quiet) {
        process.stdout.write(formatJson(jsonResults) + '\n');
      }

      if (options.format !== 'json') {
        process.stdout.write(formatSummary(totalIssues, resolvedFiles.length, summaryColor) + '\n');
      }

      resultCode = exitCode(totalIssues, options.maxWarnings);
    });

  cli.command('list [detector]', 'List word lists for a detector')
    .action(async (detector?: string) => {
      if (!detector) {
        process.stdout.write('Available detectors: weaselWords, passiveVoice, duplicateWords, longSentences, nominalizations, hedging, adverbs, aiTells\n');
        return 0;
      }

      switch (detector) {
        case 'weaselWords':
          process.stdout.write(allWeaselWords.join('\n') + '\n');
          break;
        case 'hedging':
          process.stdout.write(hedgingPhrases.join('\n') + '\n');
          break;
        case 'adverbs':
          process.stdout.write(fillerAdverbs.join('\n') + '\n');
          break;
        case 'nominalizations':
          process.stdout.write(nominalizations.map(n => `${n.word} → ${n.suggestion}`).join('\n') + '\n');
          break;
        case 'aiTells':
          process.stdout.write('# Vocabulary\n');
          process.stdout.write(aiTellsVocabulary.map(v => v.variants?.length ? `${v.word} (also: ${v.variants.join(', ')})` : v.word).join('\n') + '\n');
          process.stdout.write('# Phrases\n');
          process.stdout.write(aiTellsPhrases.map(p => p.phrase).join('\n') + '\n');
          process.stdout.write('# Structural patterns (disable via removePatterns)\n');
          process.stdout.write(aiTellsPatterns.map(p => `${p.name} — ${p.reason}`).join('\n') + '\n');
          break;
        default:
          process.stdout.write(`Detector "${detector}" does not have a configurable word list.\n`);
      }
      return 0;
    });

  cli.command('init', 'Create a .wscrc.json config file')
    .action(async () => {
      const configPath = resolve('.wscrc.json');
      const config = {
        $schema: 'https://wsc.theserverless.dev/schema.json',
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
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
      process.stdout.write(`Created ${configPath}\n`);
      return 0;
    });

  cli.help();
  cli.version(readPackageVersion(import.meta.url, 'wsc-lint'));

  try {
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
  } catch (err: any) {
    if (err.message) {
      process.stderr.write(`Error: ${err.message}\n`);
    }
    return 2;
  }

  return resultCode;
}

/**
 * Exit code policy:
 *   maxWarnings < 0  -> unlimited: never fail (annotate-only, the default)
 *   maxWarnings >= 0 -> fail (1) when issues exceed the threshold
 * Pass `--max-warnings 0` to fail on any issue at all.
 */
export function exitCode(totalIssues: number, maxWarnings: number): number {
  const max = Number(maxWarnings);
  if (!Number.isFinite(max) || max < 0) return 0;
  return totalIssues > max ? 1 : 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
