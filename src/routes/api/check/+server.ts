import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeText, validateConfig, makeLineIndex } from '../../../core';
import type { WscConfig } from '../../../core';

const MAX_TEXT_LENGTH = 100_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const POST: RequestHandler = async ({ request }) => {
  const startTime = performance.now();

  let body: { text?: string; config?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text } = body;
  if (!text || typeof text !== 'string') {
    return json({ error: 'Missing or invalid "text" field' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
  }

  let config: WscConfig | undefined;
  if (body.config !== undefined) {
    const errors = validateConfig(body.config);
    if (errors.length > 0) {
      return json({ error: 'Invalid config', details: errors }, { status: 400 });
    }
    config = body.config as WscConfig;
  }

  if (body.format !== undefined && body.format !== 'markdown' && body.format !== 'plain') {
    return json({ error: 'Invalid "format": must be "markdown" or "plain"' }, { status: 400 });
  }

  const result = analyzeText(text, config, { markdown: body.format === 'markdown' });

  const getLineCol = makeLineIndex(text);

  const getContext = (index: number, length: number) => {
    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + length + 20);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return `${prefix}${text.substring(start, end)}${suffix}`;
  };

  const enrichIssue = <T extends { index: number; length: number }>(item: T) => ({
    ...item,
    ...getLineCol(item.index),
    context: getContext(item.index, item.length),
  });

  const response = {
    summary: result.summary,
    issues: {
      weaselWords: result.issues.weaselWords.map(enrichIssue),
      passiveVoice: result.issues.passiveVoice.map(enrichIssue),
      duplicateWords: result.issues.duplicateWords.map(enrichIssue),
      longSentences: result.issues.longSentences.map(enrichIssue),
      nominalizations: result.issues.nominalizations.map(enrichIssue),
      hedging: result.issues.hedging.map(enrichIssue),
      adverbs: result.issues.adverbs.map(enrichIssue),
      aiTells: result.issues.aiTells.map(enrichIssue),
    },
    meta: {
      ...result.meta,
      processingTimeMs: Math.round(performance.now() - startTime),
    },
  };

  return json(response, { headers: CORS_HEADERS });
};

export const GET: RequestHandler = async () => {
  return json({
    name: 'Writing Style Checker API',
    version: '1.1.0',
    endpoint: 'POST /api/check',
    parameters: {
      text: { type: 'string', required: true, maxLength: MAX_TEXT_LENGTH },
      config: { type: 'object', required: false, description: 'Optional WscConfig to customize detectors' },
      format: { type: 'string', required: false, enum: ['plain', 'markdown'], description: 'Set to "markdown" to skip code blocks, tables, and headings' },
    },
    detectors: [
      'weaselWords', 'passiveVoice', 'duplicateWords',
      'longSentences', 'nominalizations', 'hedging', 'adverbs', 'aiTells',
    ],
    docs: 'https://wsc.theserverless.dev',
  }, { headers: CORS_HEADERS });
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};
