import { describe, it, expect, beforeAll, vi } from 'vitest';
import { analyzeText, getLineCol, getContext, createServer } from '../../mcp-server/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { writeFile, unlink, mkdir, rm, readFile as readFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ============================================================================
// getLineCol
// ============================================================================

describe('getLineCol', () => {
  it('returns line 1, column 1 for index 0', () => {
    expect(getLineCol('hello', 0)).toEqual({ line: 1, column: 1 });
  });

  it('returns correct column within first line', () => {
    expect(getLineCol('hello world', 6)).toEqual({ line: 1, column: 7 });
  });

  it('returns correct line and column for multiline text', () => {
    const text = 'line1\nline2\nline3';
    // "line2" starts at index 6
    expect(getLineCol(text, 6)).toEqual({ line: 2, column: 1 });
    // "line3" starts at index 12
    expect(getLineCol(text, 12)).toEqual({ line: 3, column: 1 });
    // "e3" starts at index 15
    expect(getLineCol(text, 15)).toEqual({ line: 3, column: 4 });
  });
});

// ============================================================================
// getContext
// ============================================================================

describe('getContext', () => {
  it('returns full text without ellipsis when text is short', () => {
    const text = 'hello very world';
    const result = getContext(text, 6, 4); // "very" at index 6
    expect(result).toBe('hello very world');
    expect(result).not.toContain('...');
  });

  it('adds leading ellipsis when index is far from start', () => {
    const text = 'A'.repeat(30) + 'very' + 'B'.repeat(30);
    const result = getContext(text, 30, 4);
    expect(result.startsWith('...')).toBe(true);
  });

  it('adds trailing ellipsis when end is far from text end', () => {
    const text = 'A'.repeat(30) + 'very' + 'B'.repeat(30);
    const result = getContext(text, 30, 4);
    expect(result.endsWith('...')).toBe(true);
  });

  it('no leading ellipsis when near start', () => {
    const text = 'very' + 'B'.repeat(50);
    const result = getContext(text, 0, 4);
    expect(result.startsWith('...')).toBe(false);
  });

  it('no trailing ellipsis when near end', () => {
    const text = 'A'.repeat(50) + 'very';
    const result = getContext(text, 50, 4);
    expect(result.endsWith('...')).toBe(false);
  });
});

// ============================================================================
// analyzeText
// ============================================================================

describe('analyzeText', () => {
  it('reports no issues for clean text', () => {
    const result = analyzeText('The code is good.');
    expect(result).toContain('No issues found');
    expect(result).toContain('Nice work!');
  });

  it('reports weasel words', () => {
    const result = analyzeText('This is very good.');
    expect(result).toContain('WEASEL WORDS');
    expect(result).toContain('"very"');
  });

  it('reports passive voice', () => {
    const result = analyzeText('The code was written.');
    expect(result).toContain('PASSIVE VOICE');
    expect(result).toContain('"was written"');
  });

  it('reports duplicate words', () => {
    const result = analyzeText('the the code');
    expect(result).toContain('DUPLICATE WORDS');
  });

  it('reports all three issue types', () => {
    const result = analyzeText('The the code was written very fast.');
    expect(result).toContain('WEASEL WORDS');
    expect(result).toContain('PASSIVE VOICE');
    expect(result).toContain('DUPLICATE WORDS');
  });

  it('includes character and word count', () => {
    const result = analyzeText('one two three');
    expect(result).toContain('13 characters');
    expect(result).toContain('3 words');
  });

  it('uses singular "issue" for exactly 1', () => {
    const result = analyzeText('This is very good.');
    expect(result).toContain('1 issue ');
    expect(result).not.toContain('1 issues');
  });

  it('uses plural "issues" for more than 1', () => {
    const result = analyzeText('The code was written very fast.');
    expect(result).toMatch(/\d+ issues/);
  });

  it('includes line and column in output', () => {
    const result = analyzeText('Hello\nThis is very good.');
    expect(result).toContain('line 2');
  });

  it('reports new detector types (nominalizations, hedging, adverbs)', () => {
    const output = analyzeText('The utilization was high. I think it is totally fine.');
    expect(output).toContain('NOMINALIZATIONS');
    expect(output).toContain('HEDGING');
    expect(output).toContain('FILLER ADVERBS');
  });

  it('reports long sentences', () => {
    const longText = Array(35).fill('word').join(' ') + '.';
    const output = analyzeText(longText);
    expect(output).toContain('LONG SENTENCES');
    expect(output).toContain('35 words');
  });

  it('includes context in output', () => {
    const result = analyzeText('This is very good.');
    expect(result).toContain('Context:');
  });
});

// ============================================================================
// createServer — MCP tool integration via in-memory transport
// ============================================================================

describe('createServer — MCP integration', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  it('reports the version from mcp-server/package.json (not a hardcoded string)', async () => {
    const pkgPath = fileURLToPath(new URL('../../mcp-server/package.json', import.meta.url));
    const pkg = JSON.parse(await readFileAsync(pkgPath, 'utf-8'));
    const version = client.getServerVersion()?.version;
    expect(version).toBe(pkg.version);
  });

  it('lists 4 tools including check_file', async () => {
    const result = await client.listTools();
    const names = result.tools.map(t => t.name);
    expect(names).toContain('check_text');
    expect(names).toContain('fix_duplicates');
    expect(names).toContain('list_word_lists');
    expect(names).toContain('check_file');
  });

  it('check_text detects weasel words', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: { text: 'This is very good.' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('WEASEL WORDS');
    expect(text).toContain('"very"');
  });

  it('check_text detects passive voice', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: { text: 'Code was written.' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('PASSIVE VOICE');
  });

  it('check_text detects duplicate words', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: { text: 'the the code' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('DUPLICATE WORDS');
  });

  it('check_text reports no issues for clean text', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: { text: 'The code is good.' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('No issues found');
  });

  it('check_text returns error for text exceeding max length', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: { text: 'a'.repeat(100_001) },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('Error');
    expect(text).toContain('100000');
  });

  it('fix_duplicates removes duplicates', async () => {
    const result = await client.callTool({
      name: 'fix_duplicates',
      arguments: { text: 'hello hello world' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('Removed');
    expect(text).toContain('Cleaned text:');
  });

  it('fix_duplicates reports clean when no duplicates', async () => {
    const result = await client.callTool({
      name: 'fix_duplicates',
      arguments: { text: 'hello world' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('No duplicate words found');
  });

  it('fix_duplicates uses singular for 1 duplicate', async () => {
    const result = await client.callTool({
      name: 'fix_duplicates',
      arguments: { text: 'hello hello' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('1 duplicate word:');
    expect(text).not.toContain('1 duplicate words');
  });

  it('fix_duplicates uses plural for multiple duplicates', async () => {
    const result = await client.callTool({
      name: 'fix_duplicates',
      arguments: { text: 'hello hello world world' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toMatch(/\d+ duplicate words:/);
  });

  it('check_file reads and analyzes a text file', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-${Date.now()}.txt`);
    await writeFile(tmpFile, 'This is very good.', 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: tmpFile },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain(`File: ${tmpFile}`);
      expect(text).toContain('WEASEL WORDS');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('check_file returns error for nonexistent file', async () => {
    const result = await client.callTool({
      name: 'check_file',
      arguments: { path: '/nonexistent/file.txt' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('Error reading file');
  });

  // NOTE: The `String(err)` branch on line 139 of server.ts (the else path
  // of `err instanceof Error`) cannot be tested through the MCP integration
  // because Node's `readFile` always throws Error instances and ESM module
  // namespaces are not mockable with vi.spyOn. This single branch (1.21% of
  // total branches) is defensive code for a case that cannot occur with
  // Node's fs module. The Error path is fully covered by the nonexistent
  // file test above.

  it('check_file returns error for a directory without reading it', async () => {
    const dir = join(tmpdir(), `wsc-test-dir-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: dir },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain('Error');
      expect(text).toMatch(/not a regular file/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('check_file returns error for file exceeding max length', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-big-${Date.now()}.txt`);
    await writeFile(tmpFile, 'a'.repeat(100_001), 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: tmpFile },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain('Error');
      expect(text).toContain('100000');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('check_text accepts config parameter', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: {
        text: 'This is very good.',
        config: { detectors: { weaselWords: { enabled: false } } },
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).not.toContain('WEASEL WORDS');
  });

  it('check_text returns error for invalid config', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: {
        text: 'This is very good.',
        config: { unknown: true },
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('Error: Invalid config');
  });

  it('check_file accepts config parameter', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-cfg-${Date.now()}.txt`);
    await writeFile(tmpFile, 'This is very good.', 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: {
          path: tmpFile,
          config: { detectors: { weaselWords: { enabled: false } } },
        },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain(`File: ${tmpFile}`);
      expect(text).not.toContain('WEASEL WORDS');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('check_file auto-discovers .wscrc.json', async () => {
    const tmpDir = join(tmpdir(), `wsc-test-autodiscovery-${Date.now()}`);
    const subDir = join(tmpDir, 'sub');
    await mkdir(subDir, { recursive: true });

    // Write config that disables weasel words
    await writeFile(join(tmpDir, '.wscrc.json'), JSON.stringify({
      detectors: { weaselWords: { enabled: false } },
    }));
    // Write file in subdirectory
    await writeFile(join(subDir, 'test.txt'), 'This is very good.');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: join(subDir, 'test.txt') },
      });
      const text = (result.content as any)[0].text;
      // Weasel words should be disabled via auto-discovered config
      expect(text).not.toContain('WEASEL WORDS');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('check_file returns error for invalid config', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-badcfg-${Date.now()}.txt`);
    await writeFile(tmpFile, 'This is very good.', 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: {
          path: tmpFile,
          config: { unknown: true },
        },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain('Error: Invalid config');
    } finally {
      await unlink(tmpFile);
    }
  });

  // Markdown format support

  it('check_text masks markdown when format is "markdown"', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: {
        text: 'Fine prose.\n```\nvery basically utilize\n```\n',
        format: 'markdown',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('No issues found');
  });

  it('check_text does not mask markdown when format is "plain" (default)', async () => {
    const result = await client.callTool({
      name: 'check_text',
      arguments: {
        text: 'Fine prose.\n```\nvery basically utilize\n```\n',
      },
    });
    const text = (result.content as any)[0].text;
    expect(text).toContain('WEASEL WORDS');
  });

  it('check_file auto-masks a .md file by extension', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-md-${Date.now()}.md`);
    await writeFile(tmpFile, 'Fine prose.\n```\nvery basically utilize\n```\n', 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: tmpFile },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain('No issues found');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('check_file does not mask a .txt file with the same content', async () => {
    const tmpFile = join(tmpdir(), `wsc-test-txt-${Date.now()}.txt`);
    await writeFile(tmpFile, 'Fine prose.\n```\nvery basically utilize\n```\n', 'utf-8');

    try {
      const result = await client.callTool({
        name: 'check_file',
        arguments: { path: tmpFile },
      });
      const text = (result.content as any)[0].text;
      expect(text).toContain('WEASEL WORDS');
    } finally {
      await unlink(tmpFile);
    }
  });
});
