/**
 * EarningsCalendar — REAL upcoming earnings dates.
 *
 * Until 2026-09 `GET /api/v1/earnings/upcoming` was served by
 * `src/core/EarningsOracle.getUpcomingEarnings`, which picked ~25% of the
 * portfolio at random (`Math.random() > 0.25`), assigned each a random report
 * date inside the window and a hash-derived EPS estimate, and the Earnings page
 * rendered that as the user's calendar. A funded account saw "GOOGL reports in
 * 4 days, EPS est 4.00, revenue est $40B" — none of it real.
 *
 * Source: Alpha Vantage `EARNINGS_CALENDAR` (CSV, per symbol, 3-month
 * horizon). Free tier is 25 requests/day, so results are cached in-process for
 * 24h per symbol and a refusal (rate limit / "Information" body) is cached as
 * `unavailable` for 1h so a hot page cannot burn the quota. Every response
 * carries which symbols could not be resolved; the client renders "calendar
 * unavailable" for those instead of "no earnings scheduled". Never synthesised.
 */

import { MemoryCache } from '../data/cache/MemoryCache.js';
import { logger } from '../observability/logger.js';
import type { EarningsEvent } from '../types/index.js';

export type ReportTime = 'pre_market' | 'post_market' | 'during_market' | 'unknown';

export interface CalendarEvent extends EarningsEvent {
  companyName?: string;
  fiscalDateEnding?: string;
  reportTime: ReportTime;
  /** Always 'alphaVantage' today — present so the client can label provenance. */
  source: 'alphaVantage';
}

export interface UpcomingResult {
  events: CalendarEvent[];
  /** Symbols whose calendar could not be fetched (quota, network, bad body). */
  unavailable: string[];
  source: 'alphaVantage';
}

export interface EarningsCalendarOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Positive cache TTL (default 24h). */
  ttlMs?: number;
  /** Negative (unavailable) cache TTL (default 1h). */
  negativeTtlMs?: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE = Symbol('unavailable');
type CacheEntry = CalendarEvent[] | typeof UNAVAILABLE;

/** Parse one Alpha Vantage EARNINGS_CALENDAR CSV body into events. Exported for tests. */
export function parseCalendarCsv(csv: string, requestedSymbol: string): CalendarEvent[] | null {
  const text = csv.trim();
  if (!text) return [];
  // Refusals come back as a one-line JSON-ish or prose body, never a CSV header.
  if (!/^symbol,name,reportDate/i.test(text)) return null;
  const lines = text.split(/\r?\n/).slice(1);
  const events: CalendarEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // Quota / premium refusals on the CSV endpoint arrive AS a CSV: the real
    // header, then the "Information: Thank you for using Alpha Vantage…" prose
    // spread one character per column ("I,n,f,o,r,m,a,…"). Measured live
    // 2026-09-06. Without this check the row is skipped as a foreign symbol
    // and the refusal exits as "no earnings scheduled" — the exact success-
    // path-rejection trap this module exists to close.
    if (isRefusalRow(line)) return null;
    const cols = splitCsv(line);
    const [symbol, name, reportDate, fiscalDateEnding, estimate, , timeOfTheDay] = cols;
    if (!symbol || !reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) continue;
    if (symbol.toUpperCase() !== requestedSymbol.toUpperCase()) continue;
    const eps = estimate === undefined || estimate === '' ? undefined : Number(estimate);
    events.push({
      symbol: symbol.toUpperCase(),
      reportDate: new Date(`${reportDate}T00:00:00.000Z`),
      fiscalQuarter: fiscalQuarterFromDate(fiscalDateEnding || reportDate),
      epsEstimate: eps !== undefined && Number.isFinite(eps) ? eps : undefined,
      companyName: name || undefined,
      fiscalDateEnding: fiscalDateEnding || undefined,
      reportTime: mapReportTime(timeOfTheDay),
      source: 'alphaVantage',
    });
  }
  return events;
}

function isRefusalRow(line: string): boolean {
  const cols = line.split(',');
  const first = cols[0].trim();
  // A real row starts with a ticker ("GOOGL", "BRK.B"); a company name such as
  // "PREMIUM BRANDS" or "INFORMATION SERVICES GROUP" lives in column 2 and must
  // not trip the prose check below.
  if (/^[A-Z][A-Z0-9.-]{0,7}$/.test(first) && cols.length <= 8) return false;
  const joined = cols.join('');
  const spelledOut = cols.length >= 8 && cols.every((c) => c.trim().length <= 1);
  return spelledOut || /information|thank you for using|rate limit|premium|api key|invalid/i.test(joined);
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function fiscalQuarterFromDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return '';
  const q = Math.floor((Number(m[2]) - 1) / 3) + 1;
  return `Q${q} ${m[1]}`;
}

function mapReportTime(raw: string | undefined): ReportTime {
  const v = (raw || '').toLowerCase();
  if (v.includes('pre')) return 'pre_market';
  if (v.includes('post') || v.includes('after')) return 'post_market';
  if (v.includes('during')) return 'during_market';
  return 'unknown';
}

export class EarningsCalendar {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly negativeTtlMs: number;
  private readonly now: () => Date;
  private readonly cache = new MemoryCache<CacheEntry>({ defaultTtlMs: 24 * 60 * 60 * 1000 });
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

  constructor(opts: EarningsCalendarOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000;
    this.negativeTtlMs = opts.negativeTtlMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? (() => new Date());
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Upcoming events for `symbols` inside the next `daysAhead` days, sorted by date. */
  async getUpcoming(symbols: string[], daysAhead: number): Promise<UpcomingResult> {
    const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const now = this.now();
    const horizon = new Date(now.getTime() + Math.max(1, daysAhead) * DAY_MS);
    const todayKey = now.toISOString().slice(0, 10);

    const events: CalendarEvent[] = [];
    const unavailable: string[] = [];
    await Promise.all(
      unique.map(async (symbol) => {
        const entry = await this.load(symbol);
        if (entry === UNAVAILABLE) { unavailable.push(symbol); return; }
        for (const e of entry) {
          const key = e.reportDate.toISOString().slice(0, 10);
          if (key >= todayKey && e.reportDate.getTime() <= horizon.getTime()) events.push(e);
        }
      }),
    );
    events.sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime());
    unavailable.sort();
    return { events, unavailable, source: 'alphaVantage' };
  }

  private async load(symbol: string): Promise<CacheEntry> {
    const cached = this.cache.get(symbol);
    if (cached) return cached;
    const existing = this.inflight.get(symbol);
    if (existing) return existing;
    const p = this.fetchSymbol(symbol).finally(() => this.inflight.delete(symbol));
    this.inflight.set(symbol, p);
    return p;
  }

  private async fetchSymbol(symbol: string): Promise<CacheEntry> {
    if (!this.apiKey) return this.remember(symbol, UNAVAILABLE);
    const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${encodeURIComponent(symbol)}&horizon=3month&apikey=${this.apiKey}`;
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        logger.warn({ symbol, status: res.status }, 'Earnings calendar HTTP non-200');
        return this.remember(symbol, UNAVAILABLE);
      }
      const body = await res.text();
      const parsed = parseCalendarCsv(body, symbol);
      if (parsed === null) {
        logger.warn({ symbol, body: body.slice(0, 160) }, 'Earnings calendar refused (quota or premium gate)');
        return this.remember(symbol, UNAVAILABLE);
      }
      return this.remember(symbol, parsed);
    } catch (err) {
      logger.warn({ err, symbol }, 'Earnings calendar fetch failed');
      return this.remember(symbol, UNAVAILABLE);
    }
  }

  private remember(symbol: string, entry: CacheEntry): CacheEntry {
    this.cache.set(symbol, entry, entry === UNAVAILABLE ? this.negativeTtlMs : this.ttlMs);
    return entry;
  }

  /** Test seam. */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
