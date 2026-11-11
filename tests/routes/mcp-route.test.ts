import { describe, it, expect } from 'vitest';
import { POST, OPTIONS, GET } from '../../src/routes/mcp/+server';

function makeJsonRpcRequest(body: unknown): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeInvalidRequest(): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json{{',
  });
}

// ============================================================================
// POST /mcp
// ============================================================================

describe('POST /mcp', () => {
  it('handles initialize request', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    const response = await POST({ request } as any);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result.serverInfo.name).toBe('writing-style-checker');
  });

  it('handles tools/list request', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const response = await POST({ request } as any);
    const data = await response.json();
    expect(data.result.tools).toHaveLength(3);
  });

  it('handles tools/call check_text', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'check_text',
        arguments: { text: 'This is very good.' },
      },
    });
    const response = await POST({ request } as any);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('WEASEL WORDS');
  });

  it('returns parse error for invalid JSON', async () => {
    const request = makeInvalidRequest();
    const response = await POST({ request } as any);
    const data = await response.json();
    expect(data.error.code).toBe(-32700);
    expect(data.error.message).toContain('Parse error');
    expect(data.id).toBeNull();
  });

  it('returns JSON-RPC Invalid Request for a null body, not a 500', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBeNull();
    expect(data.error.code).toBe(-32600);
    expect(data.error.message).toContain('Invalid Request');
  });

  it('returns JSON-RPC Invalid Request for a batch array', async () => {
    const request = makeJsonRpcRequest([{ jsonrpc: '2.0', id: 1, method: 'initialize' }]);
    const response = await POST({ request } as any);
    const data = await response.json();
    expect(data.id).toBeNull();
    expect(data.error.code).toBe(-32600);
  });

  it('returns Content-Type application/json', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/list',
    });
    const response = await POST({ request } as any);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns CORS headers on valid request', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/list',
    });
    const response = await POST({ request } as any);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('returns CORS headers on parse error', async () => {
    const request = makeInvalidRequest();
    const response = await POST({ request } as any);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles method not found', async () => {
    const request = makeJsonRpcRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'unknown/method',
    });
    const response = await POST({ request } as any);
    const data = await response.json();
    expect(data.error.code).toBe(-32601);
  });
});

// ============================================================================
// OPTIONS /mcp
// ============================================================================

describe('OPTIONS /mcp', () => {
  it('returns CORS headers with null body', async () => {
    const response = await OPTIONS({} as any);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.body).toBeNull();
  });
});

// ============================================================================
// GET /mcp
// ============================================================================

describe('GET /mcp', () => {
  it('returns server info JSON', async () => {
    const response = await GET({} as any);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe('Writing Style Checker MCP Server');
    expect(data.version).toBe('2.2.2');
    expect(data.tools).toEqual(['check_text', 'fix_duplicates', 'list_word_lists']);
    expect(data.protocol).toContain('MCP');
  });

  it('returns Content-Type application/json', async () => {
    const response = await GET({} as any);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns CORS header', async () => {
    const response = await GET({} as any);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
