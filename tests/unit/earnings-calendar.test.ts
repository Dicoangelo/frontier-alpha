/**
 * EarningsCalendar — the real replacement for the Math.random() calendar.
 * Pins: CSV parsing, window filtering, per-symbol caching (quota protection),
 * refusal → `unavailable` (never synthesised), and determinism.
 */
import { describe, it, expect, vi } from 'vitest';
import { EarningsCalendar, parseCalendarCsv } from '../../src/earnings/EarningsCalendar.js';

const CSV_HEADER = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay';
const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\r\n') + '\r\n';
const NOW = new Date('2026-09-06T12:00:00Z');

function fetchStub(bodies: Record<string, string | number>) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    const symbol = new URL(url).searchParams.get('symbol') ?? '';
    calls.push(symbol);
    const body = bodies[symbol];
    if (typeof body === 'number') return new Response('err', { status: body });
    return new Response(body ?? csv([]), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('parseCalendarCsv', () => {
  it('parses rows for the requested symbol, deriving quarter and report time', () => {
    const out = parseCalendarCsv(csv(['GOOGL,ALPHABET INC - CLASS A,2026-10-28,2026-09-30,3.02,USD,post-market']), 'GOOGL')!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: 'GOOGL', fiscalQuarter: 'Q3 2026', epsEstimate: 3.02, reportTime: 'post_market', source: 'alphaVantage' });
    expect(out[0].reportDate.toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });

  it('returns null (refusal) when the body is not a calendar CSV', () => {
    expect(parseCalendarCsv('{"Information": "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day."}', 'AAPL')).toBeNull();
  });

  it('treats the spelled-out "Information" row under a valid header as a refusal, not an empty calendar', () => {
    // Exactly what the CSV endpoint returns once the 25/day quota is spent (measured 2026-09-06).
    const spelled = 'I,n,f,o,r,m,a,t,i,o,n,:, ,T,h,a,n,k, ,y,o,u';
    expect(parseCalendarCsv(csv([spelled]), 'NVDA')).toBeNull();
    expect(parseCalendarCsv(csv(['Information: Thank you for using Alpha Vantage,,,,,,']), 'NVDA')).toBeNull();
  });

  it('does not mistake a company name containing "premium" or "information" for a refusal', () => {
    const out = parseCalendarCsv(csv(['PBH,PREMIUM BRANDS HOLDINGS,2026-11-05,2026-09-30,1.10,USD,pre-market', 'III,INFORMATION SERVICES GROUP,2026-11-06,2026-09-30,0.05,USD,']), 'PBH')!;
    expect(out.map((e) => e.symbol)).toEqual(['PBH']);
  });

  it('returns an empty list for a header-only body and tolerates a missing estimate', () => {
    expect(parseCalendarCsv(csv([]), 'AAPL')).toEqual([]);
    const out = parseCalendarCsv(csv(['AAPL,APPLE INC,2026-10-30,2026-09-30,,USD,']), 'AAPL')!;
    expect(out[0].epsEstimate).toBeUndefined();
    expect(out[0].reportTime).toBe('unknown');
  });
});

describe('EarningsCalendar.getUpcoming', () => {
  it('returns only events inside the window, sorted, and never invents one', async () => {
    const { impl } = fetchStub({
      GOOGL: csv(['GOOGL,ALPHABET,2026-10-28,2026-09-30,3.02,USD,post-market']),
      NVDA: csv(['NVDA,NVIDIA,2026-09-10,2026-07-31,1.10,USD,post-market', 'NVDA,NVIDIA,2026-11-19,2026-10-31,1.20,USD,post-market']),
      AAPL: csv([]),
    });
    const cal = new EarningsCalendar({ apiKey: 'k', fetchImpl: impl, now: () => NOW });
    const r = await cal.getUpcoming(['GOOGL', 'NVDA', 'AAPL'], 14);
    expect(r.events.map((e) => e.symbol)).toEqual(['NVDA']);
    expect(r.unavailable).toEqual([]);
    const wide = await cal.getUpcoming(['GOOGL', 'NVDA', 'AAPL'], 90);
    expect(wide.events.map((e) => `${e.symbol}:${e.reportDate.toISOString().slice(0, 10)}`)).toEqual(['NVDA:2026-09-10', 'GOOGL:2026-10-28', 'NVDA:2026-11-19']);
  });

  it('is deterministic: the same inputs give the same events every call', async () => {
    const { impl } = fetchStub({ MSFT: csv(['MSFT,MICROSOFT,2026-10-22,2026-09-30,3.40,USD,post-market']) });
    const cal = new EarningsCalendar({ apiKey: 'k', fetchImpl: impl, now: () => NOW });
    const a = await cal.getUpcoming(['MSFT'], 60);
    const b = await cal.getUpcoming(['MSFT'], 60);
    expect(a).toEqual(b);
  });

  it('fetches each symbol once and serves the rest from cache (25 req/day quota)', async () => {
    const { impl, calls } = fetchStub({ AAPL: csv([]), MSFT: csv([]) });
    const cal = new EarningsCalendar({ apiKey: 'k', fetchImpl: impl, now: () => NOW });
    await Promise.all([cal.getUpcoming(['AAPL', 'MSFT'], 14), cal.getUpcoming(['AAPL'], 30)]);
    await cal.getUpcoming(['MSFT', 'AAPL'], 90);
    expect(calls.sort()).toEqual(['AAPL', 'MSFT']);
  });

  it('reports a refused or failed symbol as unavailable instead of synthesising it', async () => {
    const { impl } = fetchStub({ AMZN: '{"Information": "rate limit"}', TSLA: 500, NVDA: csv([]) });
    const cal = new EarningsCalendar({ apiKey: 'k', fetchImpl: impl, now: () => NOW });
    const r = await cal.getUpcoming(['AMZN', 'TSLA', 'NVDA'], 30);
    expect(r.events).toEqual([]);
    expect(r.unavailable).toEqual(['AMZN', 'TSLA']);
  });

  it('marks every symbol unavailable without an API key and makes no request', async () => {
    const { impl, calls } = fetchStub({});
    const cal = new EarningsCalendar({ apiKey: '', fetchImpl: impl, now: () => NOW });
    const r = await cal.getUpcoming(['AAPL'], 14);
    expect(r.unavailable).toEqual(['AAPL']);
    expect(calls).toEqual([]);
  });
});
