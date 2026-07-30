# Provider entitlements — measured, not assumed

Polygon.io was acquired by **Massive** (2026-06); 403 bodies now point at
`massive.com/pricing`. The plan is **Stocks Starter**.

Every row below is an **observed response** against the production key on
**2026-07-30**, not a reading of the pricing page. Re-measure before trusting
this file — that is the entire point of it.

## REST

| Endpoint | Result |
|---|---|
| `/v2/aggs/ticker/{T}/prev` | ✅ 200 |
| `/v2/aggs/ticker/{T}/range/1/{day,minute}/…` | ✅ 200, `status: DELAYED` (15-min) |
| `/v2/aggs/grouped/locale/us/market/stocks/{date}` | ✅ 200 — **12,479 tickers in one call** |
| `/v2/snapshot/…` (any form) | ❌ 403 `NOT_AUTHORIZED` |
| `/v2/last/trade/{T}` | ❌ 403 `NOT_AUTHORIZED` |
| `/v3/snapshot/options/{T}` | ❌ 403 — needs a separate Options plan |
| History older than ~5 years (2021 and earlier) | ❌ 403 |
| Call rate | ✅ Unlimited (10 distinct tickers, no throttle) |

## Flat Files (S3)

Endpoint `https://files.massive.com`, bucket `flatfiles`. Credentials are the
Access Key ID plus the API key as the secret (dashboard → Keys).

| Prefix | Result |
|---|---|
| `us_stocks_sip/day_aggs_v1/` | ✅ 206 |
| `us_stocks_sip/minute_aggs_v1/` | ✅ 206 |
| `us_stocks_sip/{trades,quotes}_v1/` | ❌ 403 |
| `us_options_opra/**` | ❌ 403 |
| `us_indices/**` | ❌ 403 |

Same ~5-year window. Objects carry an `x-amz-meta-entitlement-data-type` header,
so entitlement is per data type, not per bucket.

**Flat files are not worth wiring at this scale.** `CacheWarmer` already uses
grouped-daily (one call, every ticker) for freshness and per-symbol REST for
deep backfill. Backfilling 300 days for ~20 symbols would mean ~96 MB of daily
files versus 20 REST calls. They only win for market-wide cross-sectional
history across thousands of tickers, which this app does not do.

## The trap this file exists to prevent

A 403 here is **silent**. `fetchFromPolygon` returned an empty map on
`!response.ok`, and the edge handler wrapped that as
`{"success":true,"data":null}` — so a plan-tier rejection was indistinguishable
from "no data" to every layer above it, including `/health`.

It survived for months because the health probe called
`/v2/aggs/ticker/AAPL/prev` (entitled) while the quote path called
`/v2/snapshot/…` (not entitled). **A check that exercises a different endpoint
than the feature it covers is not a check.**

Compounding it, a previous fix had swapped `/v2/last/trade` → `/v2/snapshot`
believing snapshot was entitled on Starter, and wrote that belief into a code
comment *and* into `CLAUDE.md`. Confident prose is not measurement.

Rules:

1. Never widen an endpoint without re-measuring entitlement against the live key.
2. Never let a provider rejection exit through a success path — 401/403 must
   surface as `PROVIDER_NOT_ENTITLED`, not as an empty result.
3. Point health probes at the *same call* the feature makes.

## Re-measuring

```bash
K=$(grep '^POLYGON_API_KEY=' .env.local | cut -d= -f2- | tr -d '"' | tr -d '\r')

for path in \
  'v2/aggs/ticker/AAPL/prev' \
  'v2/aggs/ticker/AAPL/range/1/day/2026-07-01/2026-07-30' \
  'v2/snapshot/locale/us/markets/stocks/tickers/AAPL' \
  'v2/last/trade/AAPL' \
  'v3/snapshot/options/AAPL'
do
  # NB: do not name this variable `status` — it is read-only in zsh.
  result=$(curl -s "https://api.polygon.io/${path}?apiKey=${K}" \
    | grep -o '"status":"[A-Z_]*"' | head -1)
  printf '%-52s %s\n' "$path" "${result:-<no status field>}"
done
```

Expect `OK` or `DELAYED` for the two `aggs` paths and `NOT_AUTHORIZED` for the
other three. Any change means the plan changed — update the tables above and
re-check `probePolygon`.

## Related

- `src/data/MarketDataProvider.ts` — entitlement table repeated inline at
  `fetchPolygonQuote`, deliberately, so it is read at the point of change.
- `src/routes/health.ts` — `probePolygon` issues the quote path's exact call.
- `CHANGELOG.md` `[1.14.0]` — the full incident.
