import { describe, it, expect } from 'vitest';
import {
  BASE_HISTORY_DAYS,
  SUPPORTED_WINDOWS,
  lastBarDate,
  sliceAsOf,
  windowToDays,
} from './historySlice.js';
import type { Price } from '../types/index.js';

function makeSeries(symbol: string, count: number, startDate = new Date('2026-01-01')): Price[] {
  const out: Price[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(startDate);
    ts.setUTCDate(ts.getUTCDate() + i);
    out.push({
      symbol,
      timestamp: ts,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1_000_000,
    });
  }
  return out;
}

describe('sliceAsOf', () => {
  it('returns identity slice when daysBack is 0', () => {
    const prices = new Map([['AAPL', makeSeries('AAPL', 10)]]);
    const sliced = sliceAsOf(prices, 0);
    expect(sliced.get('AAPL')?.length).toBe(10);
    expect(sliced.get('AAPL')).not.toBe(prices.get('AAPL'));
  });

  it('truncates each series by daysBack from the end', () => {
    const prices = new Map([
      ['AAPL', makeSeries('AAPL', 100)],
      ['MSFT', makeSeries('MSFT', 100)],
    ]);
    const sliced = sliceAsOf(prices, 5);
    expect(sliced.get('AAPL')?.length).toBe(95);
    expect(sliced.get('MSFT')?.length).toBe(95);
    const lastApple = sliced.get('AAPL')!.at(-1)!;
    const fullApple = prices.get('AAPL')!;
    expect(lastApple.timestamp).toEqual(fullApple[fullApple.length - 6].timestamp);
  });

  it('drops symbols whose series is shorter than daysBack', () => {
    const prices = new Map([
      ['AAPL', makeSeries('AAPL', 100)],
      ['SHORT', makeSeries('SHORT', 3)],
    ]);
    const sliced = sliceAsOf(prices, 5);
    expect(sliced.has('AAPL')).toBe(true);
    expect(sliced.has('SHORT')).toBe(false);
  });

  it('does not mutate the input map or arrays', () => {
    const apple = makeSeries('AAPL', 10);
    const prices = new Map([['AAPL', apple]]);
    sliceAsOf(prices, 3);
    expect(apple.length).toBe(10);
    expect(prices.get('AAPL')?.length).toBe(10);
  });

  it('throws on negative daysBack', () => {
    expect(() => sliceAsOf(new Map(), -1)).toThrow();
  });

  it('returns an empty map when input is empty', () => {
    expect(sliceAsOf(new Map(), 5).size).toBe(0);
  });
});

describe('lastBarDate', () => {
  it('returns YYYY-MM-DD of the last bar', () => {
    const prices = makeSeries('AAPL', 5, new Date('2026-05-01T00:00:00Z'));
    expect(lastBarDate(prices)).toBe('2026-05-05');
  });

  it('returns empty string for empty series', () => {
    expect(lastBarDate([])).toBe('');
  });

  it('handles non-Date timestamps via coercion', () => {
    const ts = '2026-05-09T00:00:00Z' as unknown as Date;
    const prices: Price[] = [{
      symbol: 'X',
      timestamp: ts,
      open: 1, high: 1, low: 1, close: 1, volume: 1,
    }];
    expect(lastBarDate(prices)).toBe('2026-05-09');
  });
});

describe('windowToDays + constants', () => {
  it('maps 1d to 1 and 5d to 5', () => {
    expect(windowToDays('1d')).toBe(1);
    expect(windowToDays('5d')).toBe(5);
  });

  it('exports BASE_HISTORY_DAYS large enough for 252-day momentum + 21-day skip + headroom', () => {
    expect(BASE_HISTORY_DAYS).toBeGreaterThanOrEqual(252 + 21);
  });

  it('lists 1d and 5d as supported windows', () => {
    expect(SUPPORTED_WINDOWS).toEqual(['1d', '5d']);
  });
});
