import type { RequestHandler } from './$types';
import { handleMcpRequest } from '../../mcp/handler';

export const POST: RequestHandler = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  const result = await handleMcpRequest(body);

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
};

export const GET: RequestHandler = async () => {
  return new Response(JSON.stringify({
    name: 'Writing Style Checker MCP Server',
    description: 'MCP server for detecting writing style issues: weasel words, passive voice, duplicate words, long sentences, nominalizations, hedging, filler adverbs, and AI tells.',
    version: '2.2.2',
    tools: ['check_text', 'fix_duplicates', 'list_word_lists'],
    docs: 'https://wsc.theserverless.dev',
    protocol: 'MCP (Model Context Protocol) over Streamable HTTP',
    usage: 'POST JSON-RPC 2.0 requests to this endpoint'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
};
