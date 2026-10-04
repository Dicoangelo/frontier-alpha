import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createMcpHandler, requestAgent, validateResearchArguments, runStdio } from '../../scripts/frontier-agent.mjs';

const env = { FRONTIER_API_URL: 'https://frontier.example', FRONTIER_API_KEY: 'fa_synthetic' };

describe('research CLI and MCP adapter', () => {
  it('passes scoped API credentials only in headers, rejects redirects, and does not retry', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { status: 'completed' } })));
    expect(await requestAgent('research', { question: 'AAPL price' }, { env, fetcher })).toEqual({ status: 'completed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, config] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://frontier.example/api/v1/agent/research');
    expect(config).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer fa_synthetic' }, method: 'POST' });
    expect(config.body).not.toContain('fa_synthetic');
  });
  it.each(['http://remote.example', 'https://user:secret@example.com', 'https://example.com/?token=x'])('refuses unsafe credential destination %s', async base => {
    const fetcher = vi.fn();
    await expect(requestAgent('status', undefined, { env: { ...env, FRONTIER_API_URL: base }, fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns an explicit uncertain result without retry or raw secret-bearing errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('fa_synthetic'));
    await expect(requestAgent('research', { question: 'AAPL' }, { env, fetcher })).rejects.toThrow('outcome may be unknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('disallows user identity, arbitrary tools, or excess symbols from MCP arguments', () => {
    expect(() => validateResearchArguments({ question: 'Research', userId: 'another' })).toThrow();
    expect(() => validateResearchArguments({ question: 'Research', symbols: ['A', 'B', 'C', 'D', 'E'] })).toThrow();
  });
  it('requires initialization, lists only read tools, and makes one authenticated API call per research call', async () => {
    const client = vi.fn().mockResolvedValue({ id: 'run1', status: 'completed' });
    const handle = createMcpHandler(client);
    expect((await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code).toBe(-32000);
    const initialized = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(initialized.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
    const listing = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(listing.result.tools.map(tool => tool.name)).toEqual(['frontier_research_status', 'frontier_research']);
    expect(listing.result.tools.every(tool => tool.annotations.readOnlyHint)).toBe(true);
    const args = { question: 'Describe AAPL', symbols: ['AAPL'] };
    const result = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'frontier_research', arguments: args } });
    expect(client).toHaveBeenCalledExactlyOnceWith('research', args, { signal: expect.any(AbortSignal) });
    expect(result.result.structuredContent).toEqual({ id: 'run1', status: 'completed' });
    expect(result.result.content[0].type).toBe('text');
  });
  it('never starts paid work for a notification, unknown tool, or invalid parameters', async () => {
    const client = vi.fn(); const handle = createMcpHandler(client);
    await handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(await handle({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'frontier_research', arguments: { question: 'Research' } } })).toBeNull();
    expect((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'place_order' } })).error.code).toBe(-32602);
    expect((await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'frontier_research_status', arguments: { user: 'other' } } })).error.code).toBe(-32602);
    expect(client).not.toHaveBeenCalled();
  });
  it('emits only JSON-RPC frames on the actual stdio process, with no startup logs', () => {
    const result = spawnSync(process.execPath, ['scripts/frontier-agent.mjs', 'mcp'], { encoding: 'utf8', input: [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      'invalid json', '',
    ].join('\n') });
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
    const frames = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(frames).toHaveLength(3); expect(frames.every(frame => frame.jsonrpc === '2.0')).toBe(true);
    expect(frames.find(frame => frame.error)?.error.code).toBe(-32700);
  });
  it('serves ping and cancellation while research is active, aborts HTTP, and suppresses a cancelled result', async () => {
    let callSignal: AbortSignal;
    const client = vi.fn((_path, _body, { signal }) => new Promise((_resolve, reject) => {
      callSignal = signal;
      signal.addEventListener('abort', () => reject(new Error('cancelled')));
    }));
    const input = new PassThrough(); const output = new PassThrough(); let text = '';
    output.on('data', chunk => { text += chunk.toString(); });
    const running = runStdio(input, output, createMcpHandler(client));
    const send = message => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    send({ id: 1, method: 'initialize' });
    send({ id: 2, method: 'tools/call', params: { name: 'frontier_research', arguments: { question: 'Describe AAPL' } } });
    await vi.waitFor(() => expect(client).toHaveBeenCalledOnce());
    send({ id: 3, method: 'ping' });
    await vi.waitFor(() => expect(text).toContain('"id":3'));
    expect(text).not.toContain('"id":2');
    send({ method: 'notifications/cancelled', params: { requestId: 2, reason: 'User cancelled' } });
    await vi.waitFor(() => expect(callSignal.aborted).toBe(true));
    input.end(); await running;
    expect(text).not.toContain('"id":2'); expect(client).toHaveBeenCalledOnce();
  });
});
