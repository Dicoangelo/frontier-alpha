/**
 * Fold the per-symbol factor payload from `GET /api/v1/portfolio/factors/:symbols`
 * into one portfolio-level list (average across holdings, top-N by |exposure|).
 *
 * Extracted from the Dashboard so the envelope handling is testable. The server
 * wraps the map in `{ success, data: { SYM: FactorExposure[] } }`; the Dashboard
 * used to index the *envelope* by symbol (`json['NVDA']` → undefined), so every
 * visitor saw "No exposures" / "Awaiting price history" / "Connect your
 * portfolio" even though the API had returned 76 factors per holding. Accepts
 * both the envelope and a bare map so the legacy shape keeps working.
 */

export interface AggregatedFactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

interface RawFactorRow {
  factor: string;
  exposure: number;
  tStat?: number;
  confidence?: number;
  contribution?: number;
}

type FactorMap = Record<string, RawFactorRow[]>;

/** Unwrap `{ success, data }` or pass a bare map through. */
export function unwrapFactorPayload(json: unknown): FactorMap {
  if (!json || typeof json !== 'object') return {};
  const obj = json as Record<string, unknown>;
  const inner = 'data' in obj && obj.data && typeof obj.data === 'object' ? obj.data : obj;
  const out: FactorMap = {};
  for (const [symbol, rows] of Object.entries(inner as Record<string, unknown>)) {
    if (Array.isArray(rows)) out[symbol] = rows as RawFactorRow[];
  }
  return out;
}

export function aggregatePortfolioFactors(
  json: unknown,
  symbols: string[],
  limit = 10,
): AggregatedFactorExposure[] {
  const bySymbol = unwrapFactorPayload(json);
  const totals = new Map<string, { exposure: number; tStat: number; contribution: number; count: number }>();

  for (const symbol of symbols) {
    const rows = bySymbol[symbol] ?? bySymbol[symbol.toUpperCase()] ?? [];
    for (const f of rows) {
      if (!f || typeof f.factor !== 'string' || !Number.isFinite(f.exposure)) continue;
      const t = totals.get(f.factor) ?? { exposure: 0, tStat: 0, contribution: 0, count: 0 };
      totals.set(f.factor, {
        exposure: t.exposure + f.exposure,
        tStat: t.tStat + (f.tStat ?? 0),
        contribution: t.contribution + (f.contribution ?? 0),
        count: t.count + 1,
      });
    }
  }

  const aggregated: AggregatedFactorExposure[] = [];
  for (const [factor, t] of totals) {
    const tStat = t.tStat / t.count;
    aggregated.push({
      factor,
      exposure: t.exposure / t.count,
      tStat,
      confidence: Math.min(Math.abs(tStat) / 2, 1),
      contribution: t.contribution / t.count,
    });
  }

  return aggregated
    .sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure))
    .slice(0, limit);
}
