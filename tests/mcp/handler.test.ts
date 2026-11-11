import { describe, it, expect, vi } from 'vitest';
import { handleMcpRequest } from '../../src/mcp/handler';
import { allWeaselWords } from '../../src/core/words';
import * as core from '../../src/core';

// ============================================================================
// Protocol-level tests
// ============================================================================

describe('handleMcpRequest — protocol', () => {
  it('rejects invalid JSON-RPC version', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '1.0' as any,
      id: 1,
      method: 'initialize',
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32600);
    expect(res.error!.message).toContain('Invalid JSON-RPC version');
  });

  it('uses id ?? null when id is missing with invalid version', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '1.0' as any,
      id: undefined as any,
      method: 'initialize',
    });
    expect(res.id).toBeNull();
  });

  it('rejects a null body with Invalid Request and id null', async () => {
    const res = await handleMcpRequest(null);
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32600);
    expect(res.id).toBeNull();
  });

  it('rejects a JSON-RPC batch array with Invalid Request and id null', async () => {
    const res = await handleMcpRequest([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
    expect(res.error!.code).toBe(-32600);
    expect(res.id).toBeNull();
  });

  it('returns method not found for unknown methods', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 99,
      method: 'some/unknown/method',
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32601);
    expect(res.error!.message).toContain('Method not found');
    expect(res.error!.message).toContain('some/unknown/method');
  });

  it('preserves the request id in the response', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 42,
      method: 'initialize',
    });
    expect(res.id).toBe(42);
  });

  it('preserves string ids', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 'abc-123',
      method: 'tools/list',
    });
    expect(res.id).toBe('abc-123');
  });

  it('always returns jsonrpc 2.0', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    expect(res.jsonrpc).toBe('2.0');
  });
});

// ============================================================================
// initialize
// ============================================================================

describe('handleMcpRequest — initialize', () => {
  it('returns protocol version, capabilities, and server info', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    expect(res.error).toBeUndefined();
    const result = res.result as any;
    expect(result.protocolVersion).toBe('2025-03-26');
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.serverInfo.name).toBe('writing-style-checker');
    expect(result.serverInfo.version).toBe('2.2.2');
  });
});

// ============================================================================
// notifications/initialized
// ============================================================================

describe('handleMcpRequest — notifications/initialized', () => {
  it('returns empty result', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'notifications/initialized',
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual({});
  });
});

// ============================================================================
// tools/list
// ============================================================================

describe('handleMcpRequest — tools/list', () => {
  it('returns four tools', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    expect(res.error).toBeUndefined();
    const result = res.result as any;
    expect(result.tools).toHaveLength(3);
    const names = result.tools.map((t: any) => t.name);
    expect(names).toContain('check_text');
    expect(names).toContain('fix_duplicates');
    expect(names).toContain('list_word_lists');
  });

  it('returns check_text tool with correct schema', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const tools = (res.result as any).tools;
    const checkText = tools.find((t: any) => t.name === 'check_text');
    expect(checkText).toBeDefined();
    expect(checkText.inputSchema.type).toBe('object');
    expect(checkText.inputSchema.properties.text).toBeDefined();
    expect(checkText.inputSchema.properties.format).toBeDefined();
    expect(checkText.inputSchema.properties.format.enum).toEqual(['plain', 'markdown']);
    expect(checkText.inputSchema.required).toContain('text');
  });

  it('returns fix_duplicates tool', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = (res.result as any).tools;
    expect(tools.find((t: any) => t.name === 'fix_duplicates')).toBeDefined();
  });
});

// ============================================================================
// tools/call — check_text
// ============================================================================

describe('handleMcpRequest — tools/call check_text', () => {
  it('analyzes text with no issues', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'The code is good.' },
      },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as any).content;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('No issues found');
    expect(content[0].text).toContain('Nice work!');
  });

  it('detects weasel words and includes them in output', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'This is very good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('WEASEL WORDS');
    expect(text).toContain('"very"');
    expect(text).toContain('line');
    expect(text).toContain('column');
    expect(text).toContain('Context:');
  });

  it('detects passive voice and includes it in output', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'The code was written by us.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('PASSIVE VOICE');
    expect(text).toContain('"was written"');
  });

  it('detects duplicate words and includes them in output', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'The the code is good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('DUPLICATE WORDS');
    expect(text).toContain('"the"');
  });

  it('detects all three issue types simultaneously', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'The the code was written very quickly.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('WEASEL WORDS');
    expect(text).toContain('PASSIVE VOICE');
    expect(text).toContain('DUPLICATE WORDS');
    expect(text).toContain('3 issues');
  });

  it('uses singular "issue" for exactly 1 issue', async () => {
    // "very" is the only issue in this text
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'This is very good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('1 issue ');
    expect(text).not.toContain('1 issues');
  });

  it('reports correct line/column for multiline text', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'Hello world.\nThis is very good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('line 2');
  });

  it('throws error for missing text argument', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: {},
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('Missing or invalid');
  });

  it('throws error for non-string text argument', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 123 },
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
  });

  it('throws error for text exceeding max length', async () => {
    const longText = 'a'.repeat(100_001);
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: longText },
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('100000');
  });

  it('accepts text at exactly max length', async () => {
    const text = 'ok. '.repeat(25_000);
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: text.slice(0, 100_000) },
      },
    });
    expect(res.error).toBeUndefined();
  }, 30000);

  it('includes word count in output', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'one two three' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('3 words');
  });

  it('includes character count in output', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'Hello world' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('11 characters');
  });

  it('includes context with ellipsis for long text', async () => {
    // Create text where the weasel word is far from the start and end
    const text = 'A'.repeat(30) + ' very ' + 'B'.repeat(30);
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text },
      },
    });
    const output = (res.result as any).content[0].text;
    expect(output).toContain('...');
  });

  it('does not include ellipsis when context covers full text', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'very' },
      },
    });
    const output = (res.result as any).content[0].text;
    // Context line itself should not have leading "..."
    const contextLine = output.split('\n').find((l: string) => l.trim().startsWith('Context:'));
    expect(contextLine).toBeDefined();
    expect(contextLine).not.toContain('...');
  });
});

// ============================================================================
// tools/call — check_text with format
// ============================================================================

describe('handleMcpRequest — tools/call check_text with format', () => {
  it('masks markdown when format is "markdown"', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: {
          text: 'Fine prose.\n```\nvery basically utilize\n```\n',
          format: 'markdown',
        },
      },
    });
    expect(res.error).toBeUndefined();
    const text = (res.result as any).content[0].text;
    expect(text).toContain('No issues found');
  });

  it('does not mask markdown when format is "plain" (default)', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: {
          text: 'Fine prose.\n```\nvery basically utilize\n```\n',
        },
      },
    });
    expect(res.error).toBeUndefined();
    const text = (res.result as any).content[0].text;
    expect(text).toContain('WEASEL WORDS');
  });

  it('returns error for invalid format value', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 72,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'hello', format: 'html' },
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('format');
  });
});

// ============================================================================
// tools/call — fix_duplicates
// ============================================================================

describe('handleMcpRequest — tools/call fix_duplicates', () => {
  it('returns clean text when no duplicates', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: { text: 'The code is good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('No duplicate words found');
    expect(text).toContain('The code is good.');
  });

  it('removes a single duplicate', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: { text: 'The the code is good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('Removed 1 duplicate word:');
    expect(text).toContain('Cleaned text:');
    expect(text).toContain('The code is good.');
  });

  it('removes multiple duplicates', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: { text: 'The the code is is good.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('Removed 2 duplicate words:');
    expect(text).toContain('Cleaned text:');
  });

  it('uses singular "word" for exactly 1 duplicate', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 33,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: { text: 'hello hello' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('1 duplicate word:');
    expect(text).not.toContain('1 duplicate words');
  });

  it('throws error for missing text argument', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: {},
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
  });

  it('throws error for non-string text argument', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 35,
      method: 'tools/call',
      params: {
        name: 'fix_duplicates',
        arguments: { text: 42 },
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
  });
});

// ============================================================================
// tools/call — list_weasel_words
// ============================================================================

// ============================================================================
// tools/call — list_word_lists
// ============================================================================

describe('handleMcpRequest — tools/call list_word_lists', () => {
  it('returns detector info', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: {
        name: 'list_word_lists',
        arguments: {},
      },
    });
    expect(res.error).toBeUndefined();
    const text = (res.result as any).content[0].text;
    expect(text).toContain('Detector Word Lists');
    expect(text).toContain('weaselWords');
    expect(text).toContain('nominalizations');
  });
});

// ============================================================================
// tools/call — check_text new detector sections
// ============================================================================

describe('handleMcpRequest — tools/call check_text new detectors', () => {
  it('reports nominalizations, hedging, and adverbs', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 48,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'The utilization was high. I think it is totally fine.' },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('NOMINALIZATIONS');
    expect(text).toContain('HEDGING');
    expect(text).toContain('FILLER ADVERBS');
  });

  it('reports long sentences', async () => {
    const longText = Array(35).fill('word').join(' ') + '.';
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 49,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: longText },
      },
    });
    const text = (res.result as any).content[0].text;
    expect(text).toContain('LONG SENTENCES');
    expect(text).toContain('35 words');
  });
});

// ============================================================================
// tools/call — check_text with config
// ============================================================================

describe('handleMcpRequest — tools/call check_text with config', () => {
  it('accepts valid config parameter', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: {
          text: 'This is very good.',
          config: { detectors: { weaselWords: { enabled: false } } },
        },
      },
    });
    expect(res.error).toBeUndefined();
    const text = (res.result as any).content[0].text;
    expect(text).not.toContain('WEASEL WORDS');
  });

  it('returns error for invalid config', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 47,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: {
          text: 'This is very good.',
          config: { unknown: true },
        },
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('Invalid config');
  });
});

// ============================================================================
// tools/call — unknown tool
// ============================================================================

describe('handleMcpRequest — tools/call unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {},
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('Unknown tool');
    expect(res.error!.message).toContain('nonexistent_tool');
  });
});

// ============================================================================
// tools/call — internal error handling
// ============================================================================

describe('handleMcpRequest — internal error fallback', () => {
  // The internal error path (code -32603) is hit when a tool handler throws
  // an error that does NOT have .code and .message properties. In the current
  // codebase, all throw statements use { code, message } objects, so this
  // path is only reachable if an unexpected runtime error occurs (e.g., a
  // TypeError). We test it by passing arguments that would cause an internal
  // error: `text: null` passes the `!text` check (since null is falsy), but
  // actually the `!text` guard catches null before it can cause a deeper error.
  //
  // To properly test the -32603 fallback, we'd need to mock a detector function
  // to throw a bare Error. Since we want to verify the path exists without
  // over-mocking, we accept this as a known gap: the -32603 fallback on line
  // 226 of handler.ts is defensive code for truly unexpected runtime errors.
  // It is partially covered by the structured error tests above (which exercise
  // the `if (error.code && error.message)` branch).

  it('returns structured error when tool throws { code, message }', async () => {
    // This exercises the `error.code && error.message` branch
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: '' },  // empty string → !text is true → throws
      },
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
    expect(res.error!.message).toContain('Missing or invalid');
  });

  it('returns generic -32603 error when tool throws unstructured error', async () => {
    // This exercises the fallback on handler.ts:226 — when a tool throws
    // something without .code and .message (e.g., a bare Error or string).
    // We mock detectWeaselWords to throw a bare Error to trigger this path.
    const spy = vi.spyOn(core, 'analyzeText').mockImplementation(() => {
      throw new Error('unexpected');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'some text' },
      },
    });

    spy.mockRestore();
    expect(logged).toHaveBeenCalledWith('mcp tools/call failed', 'check_text', expect.any(Error));
    logged.mockRestore();

    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32603);
    expect(res.error!.message).toBe('Internal error');
  });
});
