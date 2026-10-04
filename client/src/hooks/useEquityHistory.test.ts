import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEquityHistory } from './useEquityHistory';
import type { EquityHolding } from '@/lib/equitySeries';

vi.mock('@tanstack/react-query', () => ({
  useQueries: ({ queries }: { queries: Array<{ queryKey: readonly unknown[] }> }) => queries.map(query => ({
    isPending: false,
    data: {
      symbol: query.queryKey[1],
      closes: [100, 110],
      timestamps: ['2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z'],
    },
  })),
}));

describe('useEquityHistory query-count transitions', () => {
  it('rebuilds after empty, populated and expanded holdings without changing hook dependency length', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result, rerender } = renderHook(({ holdings }) => useEquityHistory(holdings, 100), { initialProps: { holdings: [] as EquityHolding[] } });
      expect(result.current.status).toBe('idle');
      rerender({ holdings: [{ symbol: 'AAA', shares: 2 }] });
      expect(result.current.status).toBe('ready');
      expect(result.current.series?.map(point => point.portfolio)).toEqual([300, 320]);
      rerender({ holdings: [{ symbol: 'AAA', shares: 2 }, { symbol: 'BBB', shares: 1 }] });
      expect(result.current.series?.map(point => point.portfolio)).toEqual([400, 430]);
      rerender({ holdings: [] });
      expect(result.current.status).toBe('idle');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
