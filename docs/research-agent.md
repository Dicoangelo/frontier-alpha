# Frontier Alpha research API and integrations

The app, CLI, and MCP adapter share one authenticated backend. Each research request
selects allowed read tools, freezes dated evidence, drafts cited findings, and uses
a separate model call to check every finding. The check is model judgment, not
human verification or a guarantee. Unsupported findings are withheld.

## API

- `GET /api/v1/agent/status` returns provider/model availability, tools, and limits.
- `POST /api/v1/agent/research` accepts `question`, up to four `symbols`, and
  `includePortfolio` (default false). See `src/agent/types.ts` for the response.
- Authenticate using the existing Supabase access token or a Frontier API key with
  `read: true`. The request cannot select another account or supply its own evidence.

Portfolio retrieval is opt-in and reads the verified account's existing rows without
creating or changing anything. Totals cover all recorded positions, capped at 200;
larger or incomplete reads fail closed. Cost-basis totals are never labelled market
valuations. Market research covers at most four selected symbols, using available
dated quotes and up to 300 daily observations. Synthetic prices and default
fundamental/macro inputs are excluded. Missing history, observation dates, coverage,
and delayed/cached data remain explicit.

Each request permits at most three model calls and 55 seconds. The existing atomic
`rate_limit_check` database function enforces four requests per account per minute;
admission has a three-second deadline and if unavailable, no provider request starts. A per-process guard limits active
runs to four (one per actor). This is not a global concurrency guarantee.

No trades, orders, account changes, web browsing, schedules, or background work are
available. Results are returned synchronously and are not persisted. There is no
job polling, replay, or reload recovery. A dropped connection or timeout can leave
provider usage uncertain; clients must never automatically retry research POSTs.
MCP cancellation aborts the adapter's HTTP request and suppresses the cancelled
result. It does not guarantee that the server/provider stopped: the Vercel adapter
uses Fastify injection, so server work may continue until its 55-second deadline
after a client disconnect. Cancellation is not a durable job cancellation receipt.

## Provider configuration

Existing server-side `DEEPSEEK_API_KEY` is preferred, otherwise `OPENAI_API_KEY`.
For the new agent only, model selection is `DEEPSEEK_AGENT_MODEL`, then a current
`DEEPSEEK_MODEL`, then `deepseek-v4-pro`. Retired `deepseek-chat` and
`deepseek-reasoner` aliases are not selected. OpenAI follows existing `OPENAI_MODEL`
or `gpt-4o-mini`. Existing explanation endpoints are unchanged. Status reflects
configuration presence, not a live provider health check.
The DeepSeek contract follows its [current chat-completion API](https://api-docs.deepseek.com/api/create-chat-completion/)
and [model updates](https://api-docs.deepseek.com/updates/), checked 2026-10-04.

The provider sends JSON output requests with a token cap, disables DeepSeek thinking,
rejects incomplete responses, and exposes no hidden reasoning. Receipt token counts
are observed usage only; absent counts are `null`. Credentials and raw vendor errors
are never returned. The receipt includes hashes, policy, model, duration, and call
count; it is an operational record, not execution authorization.

## CLI

Set `FRONTIER_API_URL` to an HTTPS origin (default production Frontier Alpha), and
provide `FRONTIER_API_KEY` or `FRONTIER_ACCESS_TOKEN` through your shell's secure
environment. Do not put credentials in arguments or commit them. HTTP is allowed
only for localhost development. Redirects are rejected to prevent credential forwarding.

```sh
node scripts/frontier-agent.mjs status
node scripts/frontier-agent.mjs research "Compare the available price trends" --symbols AAPL,MSFT
node scripts/frontier-agent.mjs research "Summarize my recorded holdings and price-factor risks" --portfolio
```

## MCP

Configure a local stdio MCP server with command `node`, arguments
`["/absolute/path/to/frontier-alpha/scripts/frontier-agent.mjs", "mcp"]`, and the
same client environment variables above. Use your MCP client's secure secret storage.
Do not give the MCP client provider or Supabase service credentials.

The adapter implements MCP `2025-06-18` initialization, ping, tool discovery, and
tool calls over newline-delimited JSON-RPC. Ping and cancellation remain responsive
during research; at most four API calls are active. Tools are `frontier_research_status`
and `frontier_research`. Only protocol messages go to stdout. The adapter makes
one API request per tool call and performs no retries. Research consumes AI provider
tokens; the host should display tool activity and preserve user cancellation controls.
Transport and tool shapes follow the [MCP stdio specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
and [tool contract](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## Validation and activation

Deterministic tests use explicitly synthetic fixtures and mocked model responses;
they verify ownership, tool bounds, quote/citation checks, unsupported-output
withholding, timeout behavior, and transport behavior. They are not an accuracy
evaluation. A deployment still requires an authenticated end-to-end provider smoke
test, a sufficient function duration (65 seconds configured), and the existing
rate-limit RPC. No new tables, production secret changes, or scheduled jobs are required.
