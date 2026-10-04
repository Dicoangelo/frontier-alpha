#!/usr/bin/env node
/** Dependency-free CLI and MCP stdio adapter. Credentials stay in the process environment. */
import { pathToFileURL } from 'node:url';

export const MCP_TOOLS = [
  {
    name: 'frontier_research_status', description: 'Read the authenticated Frontier Alpha research capability and configured model status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'frontier_research', description: 'Run one bounded account-scoped research request with cited market evidence and a separate model support check. Uses provider tokens. No trading or changes to holdings. Never automatically retry an uncertain result.',
    inputSchema: {
      type: 'object', properties: {
        question: { type: 'string', minLength: 3, maxLength: 1200 },
        symbols: { type: 'array', maxItems: 4, items: { type: 'string', pattern: '^[A-Z][A-Z0-9.-]{0,9}$' } },
        includePortfolio: { type: 'boolean', default: false, description: 'Explicitly include recorded holdings and cash for the authenticated account.' },
      }, required: ['question'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

export async function requestAgent(path, body, { env = process.env, fetcher = fetch, signal } = {}) {
  if (!['status', 'research'].includes(path)) throw new Error('Unsupported research operation.');
  const base = new URL(env.FRONTIER_API_URL || 'https://frontier-alpha.metaventionsai.com');
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('FRONTIER_API_URL must be an HTTPS origin, or an HTTP localhost origin.');
  }
  const token = env.FRONTIER_API_KEY || env.FRONTIER_ACCESS_TOKEN;
  if (!token) throw new Error('Set FRONTIER_API_KEY (read permission) or FRONTIER_ACCESS_TOKEN in the environment.');
  let response;
  try {
    response = await fetcher(new URL(`/api/v1/agent/${path}`, base), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70_000)]) : AbortSignal.timeout(70_000),
    });
  } catch {
    throw new Error('Frontier request did not return a confirmed result. The outcome may be unknown; no automatic retry was made.');
  }
  let envelope;
  try { envelope = await response.json(); }
  catch { throw new Error('Frontier returned an unreadable response. No automatic retry was made.'); }
  if (!response.ok || !envelope?.success) {
    const code = typeof envelope?.error?.code === 'string' && /^[A-Z_]{1,60}$/.test(envelope.error.code) ? envelope.error.code : 'REQUEST_FAILED';
    // Do not echo arbitrary server text or fetch errors, which can contain request credentials.
    throw new Error(`Frontier ${code} (HTTP ${response.status}). No automatic retry was made.`);
  }
  return envelope.data;
}

export function validateResearchArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['question', 'symbols', 'includePortfolio'].includes(key)) ||
    typeof value.question !== 'string' || value.question.trim().length < 3 || value.question.length > 1200 ||
    (value.includePortfolio !== undefined && typeof value.includePortfolio !== 'boolean') ||
    (value.symbols !== undefined && (!Array.isArray(value.symbols) || value.symbols.length > 4 || value.symbols.some(symbol => typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))))) {
    throw new Error('Invalid research arguments: provide a question and at most four uppercase ticker symbols.');
  }
  return value;
}

export function createMcpHandler(client = requestAgent) {
  let initialized = false;
  const requests = new Map();
  return async message => {
    const id = message?.id;
    const error = (code, text) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: text } });
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
      (id !== undefined && typeof id !== 'string' && typeof id !== 'number')) return error(-32600, 'Invalid JSON-RPC request.');
    if (id === undefined) {
      if (message.method === 'notifications/cancelled') requests.get(message.params?.requestId)?.abort();
      return null;
    }
    const result = value => ({ jsonrpc: '2.0', id, result: value });
    if (message.method === 'initialize') {
      initialized = true;
      return result({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'frontier-alpha-research', version: '1.0.0' } });
    }
    if (message.method === 'ping') return result({});
    if (!initialized) return error(-32000, 'Initialize the MCP session first.');
    if (message.method === 'tools/list') return result({ tools: MCP_TOOLS });
    if (message.method !== 'tools/call') return error(-32601, 'Method not found.');
    const name = message.params?.name;
    if (!MCP_TOOLS.some(tool => tool.name === name)) return error(-32602, 'Unknown tool.');
    const args = message.params?.arguments ?? {};
    try {
      if (name === 'frontier_research') validateResearchArguments(args);
      else if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new Error('Status does not accept arguments.');
    } catch { return error(-32602, 'Invalid tool arguments.'); }
    if (requests.has(id)) return error(-32600, 'This request ID is already active.');
    if (requests.size >= 4) return error(-32000, 'The adapter already has four active API requests.');
    const controller = new AbortController();
    requests.set(id, controller);
    try {
      const data = await client(name === 'frontier_research' ? 'research' : 'status', name === 'frontier_research' ? args : undefined, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      return result({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
    } catch (err) {
      if (controller.signal.aborted) return null;
      return result({ content: [{ type: 'text', text: err instanceof Error ? err.message : 'Research unavailable.' }], isError: true });
    } finally { requests.delete(id); }
  };
}

export async function runStdio(input = process.stdin, output = process.stdout, handler = createMcpHandler()) {
  // Decode complete newline frames; no startup banners or application logger on stdout.
  input.setEncoding('utf8');
  let buffer = '';
  const pending = new Set();
  for await (const chunk of input) {
    buffer += chunk;
    if (Buffer.byteLength(buffer, 'utf8') > 65_536) throw new Error('MCP input frame limit exceeded.');
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON.' } })}\n`); continue; }
      // Read new frames while a tool is active, keeping ping/cancellation responsive.
      if (pending.size >= 16 && message.id !== undefined && !['ping', 'initialize'].includes(message.method)) {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'MCP dispatch capacity is full.' } })}\n`);
        continue;
      }
      const task = Promise.resolve(handler(message)).then(response => {
        if (response) output.write(`${JSON.stringify(response)}\n`);
      }).catch(() => {
        if (message.id !== undefined) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Tool request failed.' } })}\n`);
      }).finally(() => pending.delete(task));
      pending.add(task);
    }
  }
  await Promise.allSettled(pending);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'mcp') return runStdio();
  if (command === 'status' && args.length === 0) {
    process.stdout.write(`${JSON.stringify(await requestAgent('status'), null, 2)}\n`); return;
  }
  if (command === 'research' && args[0]) {
    const question = args[0].startsWith('--') ? '' : args.shift();
    const body = { question, symbols: [], includePortfolio: false };
    while (args.length) {
      const flag = args.shift();
      if (flag === '--portfolio') body.includePortfolio = true;
      else if (flag === '--question' && args[0]) body.question = args.shift();
      else if (flag === '--symbols' && args[0]) body.symbols = args.shift().split(',').map(symbol => symbol.trim().toUpperCase());
      else throw new Error('Unknown argument. Use --question "...", --symbols AAPL,MSFT and/or --portfolio.');
    }
    process.stdout.write(`${JSON.stringify(await requestAgent('research', validateResearchArguments(body)), null, 2)}\n`); return;
  }
  process.stderr.write('Usage: node scripts/frontier-agent.mjs status | research "question" [--symbols AAPL,MSFT] [--portfolio] | mcp\n');
  if (command && !['--help', '-h'].includes(command)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Agent failed.'}\n`); process.exitCode = 1; });
}
