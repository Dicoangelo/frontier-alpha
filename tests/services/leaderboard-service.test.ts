/**
 * Unit Tests for LeaderboardService (Ranking Engine)
 *
 * Tests ranking algorithms, percentile calculation, metric computation,
 * and period-based filtering. Supabase client is fully mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mock Supabase before any imports that use it
// ============================================================================

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Chainable query builder mock
function createQueryBuilder(resolvedValue: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'ilike', 'single', 'order', 'limit'];
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.single.mockResolvedValue(resolvedValue);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return builder;
}

let mockFromCallCount = 0;
let mockProfilesBuilder: ReturnType<typeof createQueryBuilder>;
let mockPortfoliosBuilder: ReturnType<typeof createQueryBuilder>;

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'frontier_profiles') {
        return mockProfilesBuilder;
      }
      if (table === 'frontier_shared_portfolios') {
        return mockPortfoliosBuilder;
      }
      mockFromCallCount++;
      return createQueryBuilder({ data: null, error: null });
    }),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { LeaderboardService } from '../../src/services/LeaderboardService.js';
import type { PerformanceSnapshot } from '../../src/services/LeaderboardService.js';

// ============================================================================
// TEST DATA
// ============================================================================

const mockProfiles = [
  { user_id: 'user-001', display_name: 'Alice' },
  { user_id: 'user-002', display_name: 'Bob' },
  { user_id: 'user-003', display_name: 'Charlie' },
];

// Generate deterministic daily returns
function generateReturns(meanDaily: number, volatility: number, count: number): number[] {
  // Simple sinusoidal returns for determinism
  const returns: number[] = [];
  for (let i = 0; i < count; i++) {
    returns.push(meanDaily + volatility * Math.sin(i * 0.5));
  }
  return returns;
}

const aliceReturns = generateReturns(0.001, 0.01, 63); // Steady positive
const bobReturns = generateReturns(0.003, 0.03, 63);   // High return, high vol
const charlieReturns = generateReturns(-0.001, 0.005, 63); // Slight negative, low vol

const mockPortfolios = [
  {
    user_id: 'user-001',
    portfolio_data: { daily_returns: aliceReturns },
  },
  {
    user_id: 'user-002',
    portfolio_data: { daily_returns: bobReturns },
  },
  {
    user_id: 'user-003',
    portfolio_data: { daily_returns: charlieReturns },
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('LeaderboardService', () => {
  let service: LeaderboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFromCallCount = 0;
    mockProfilesBuilder = createQueryBuilder({ data: mockProfiles, error: null });
    mockPortfoliosBuilder = createQueryBuilder({ data: mockPortfolios, error: null });
    service = new LeaderboardService();
  });

  // --------------------------------------------------------------------------
  // computeSharpeRatio
  // --------------------------------------------------------------------------

  describe('computeSharpeRatio', () => {
    it('computes annualized Sharpe ratio for a return series', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.008, -0.01, 0.012, 0.005, 0.003, -0.002];
      const sharpe = service.computeSharpeRatio(returns);

      expect(typeof sharpe).toBe('number');
      expect(sharpe).toBeGreaterThan(0);
      // Positive average excess return + moderate vol → positive Sharpe
    });

    it('returns 0 for single-element return series', () => {
      expect(service.computeSharpeRatio([0.01])).toBe(0);
    });

    it('returns 0 for zero-variance returns', () => {
      const flat = [0.001, 0.001, 0.001, 0.001, 0.001];
      // All returns identical → zero std dev → Sharpe = 0
      expect(service.computeSharpeRatio(flat)).toBe(0);
    });

    it('returns negative Sharpe for consistently losing returns', () => {
      const losing = [-0.02, -0.015, -0.01, -0.025, -0.018, -0.012, -0.022];
      const sharpe = service.computeSharpeRatio(losing);
      expect(sharpe).toBeLessThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // computeMaxDrawdown
  // --------------------------------------------------------------------------

  describe('computeMaxDrawdown', () => {
    it('computes max drawdown from return series', () => {
      // Goes up then down
      const returns = [0.10, 0.05, -0.20, -0.10, 0.05];
      const dd = service.computeMaxDrawdown(returns);

      expect(dd).toBeGreaterThan(0);
      // After going up to ~1.155, drops to ~0.924 → dd ≈ 20%
      expect(dd).toBeGreaterThan(0.15);
      expect(dd).toBeLessThan(0.35);
    });

    it('returns 0 for empty returns', () => {
      expect(service.computeMaxDrawdown([])).toBe(0);
    });

    it('returns 0 for monotonically increasing equity', () => {
      const increasing = [0.01, 0.02, 0.015, 0.01, 0.025];
      expect(service.computeMaxDrawdown(increasing)).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // computeConsistencyScore
  // --------------------------------------------------------------------------

  describe('computeConsistencyScore', () => {
    it('gives higher score to lower drawdown and volatility', () => {
      const lowVolReturns = [0.001, 0.002, 0.001, 0.001, 0.002];
      const highVolReturns = [0.05, -0.04, 0.06, -0.03, 0.04];

      const lowDD = service.computeMaxDrawdown(lowVolReturns);
      const highDD = service.computeMaxDrawdown(highVolReturns);

      const lowScore = service.computeConsistencyScore(lowDD, lowVolReturns);
      const highScore = service.computeConsistencyScore(highDD, highVolReturns);

      expect(lowScore).toBeGreaterThan(highScore);
    });

    it('returns value between 0 and 1', () => {
      const returns = [0.01, -0.02, 0.015, -0.005, 0.01];
      const dd = service.computeMaxDrawdown(returns);
      const score = service.computeConsistencyScore(dd, returns);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // computePercentile
  // --------------------------------------------------------------------------

  describe('computePercentile', () => {
    it('returns 100 for rank 1 in a field of many', () => {
      expect(service.computePercentile(1, 100)).toBe(100);
    });

    it('returns 0 for last rank', () => {
      expect(service.computePercentile(100, 100)).toBe(0);
    });

    it('returns 100 for single participant', () => {
      expect(service.computePercentile(1, 1)).toBe(100);
    });

    it('computes correct percentile for middle ranks', () => {
      // Rank 51 of 100: (100-51)/(100-1)*100 = 49/99*100 ≈ 49
      const p = service.computePercentile(51, 100);
      expect(p).toBe(49);
    });
  });

  // --------------------------------------------------------------------------
  // rankSnapshots
  // --------------------------------------------------------------------------

  describe('rankSnapshots', () => {
    it('ranks snapshots by Sharpe ratio descending', () => {
      const snapshots: PerformanceSnapshot[] = [
        { user_id: 'user-001', returns: aliceReturns, total_return: 0.05 },
        { user_id: 'user-002', returns: bobReturns, total_return: 0.15 },
        { user_id: 'user-003', returns: charlieReturns, total_return: -0.05 },
      ];

      const entries = service.rankSnapshots(snapshots, 'sharpe');

      expect(entries).toHaveLength(3);
      expect(entries[0].rank).toBe(1);
      expect(entries[1].rank).toBe(2);
      expect(entries[2].rank).toBe(3);
      // Rank 1 should have highest Sharpe
      expect(entries[0].sharpe_ratio).toBeGreaterThanOrEqual(entries[1].sharpe_ratio);
      expect(entries[1].sharpe_ratio).toBeGreaterThanOrEqual(entries[2].sharpe_ratio);
    });

    it('ranks snapshots by total return descending', () => {
      const snapshots: PerformanceSnapshot[] = [
        { user_id: 'low', returns: [0.001], total_return: 0.001 },
        { user_id: 'high', returns: [0.1], total_return: 0.1 },
        { user_id: 'mid', returns: [0.05], total_return: 0.05 },
      ];

      const entries = service.rankSnapshots(snapshots, 'total_return');

      expect(entries[0].user_id).toBe('high');
      expect(entries[1].user_id).toBe('mid');
      expect(entries[2].user_id).toBe('low');
    });

    it('assigns percentile ranks correctly', () => {
      const snapshots: PerformanceSnapshot[] = [
        { user_id: 'a', returns: aliceReturns, total_return: 0.05 },
        { user_id: 'b', returns: bobReturns, total_return: 0.15 },
        { user_id: 'c', returns: charlieReturns, total_return: -0.05 },
      ];

      const entries = service.rankSnapshots(snapshots, 'sharpe');

      expect(entries[0].percentile).toBe(100); // rank 1 of 3
      expect(entries[1].percentile).toBe(50);  // rank 2 of 3
      expect(entries[2].percentile).toBe(0);   // rank 3 of 3
    });

    it('includes all metric values in each entry', () => {
      const snapshots: PerformanceSnapshot[] = [
        { user_id: 'a', returns: aliceReturns, total_return: 0.05 },
      ];

      const entries = service.rankSnapshots(snapshots, 'sharpe');

      expect(entries[0]).toHaveProperty('sharpe_ratio');
      expect(entries[0]).toHaveProperty('total_return');
      expect(entries[0]).toHaveProperty('risk_adjusted_return');
      expect(entries[0]).toHaveProperty('max_drawdown');
      expect(entries[0]).toHaveProperty('consistency_score');
      expect(entries[0]).toHaveProperty('rank');
      expect(entries[0]).toHaveProperty('percentile');
      expect(entries[0]).toHaveProperty('metric_value');
    });
  });

  // --------------------------------------------------------------------------
  // getLeaderboard (integration with Supabase mock)
  // --------------------------------------------------------------------------

  describe('getLeaderboard', () => {
    it('fetches public profiles and portfolios, returns ranked entries', async () => {
      const result = await service.getLeaderboard('sharpe', '3m');

      expect(result.metric).toBe('sharpe');
      expect(result.period).toBe('3m');
      expect(result.total_participants).toBe(3);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].rank).toBe(1);
      expect(result.updated_at).toBeDefined();
    });

    it('returns empty result when no public profiles', async () => {
      mockProfilesBuilder = createQueryBuilder({ data: [], error: null });

      const result = await service.getLeaderboard('total_return', '1m');

      expect(result.entries).toHaveLength(0);
      expect(result.total_participants).toBe(0);
    });

    it('returns empty result on profile fetch error', async () => {
      mockProfilesBuilder = createQueryBuilder({ data: null, error: { message: 'db error' } });

      const result = await service.getLeaderboard();

      expect(result.entries).toHaveLength(0);
      expect(result.total_participants).toBe(0);
    });

    it('filters returns by period (1w uses last 5 days)', async () => {
      // Create portfolio with 63 days of returns — 1w should use only last 5
      const result = await service.getLeaderboard('sharpe', '1w');

      expect(result.entries).toHaveLength(3);
      expect(result.period).toBe('1w');
    });

    it('handles portfolios with missing daily_returns gracefully', async () => {
      mockPortfoliosBuilder = createQueryBuilder({
        data: [
          { user_id: 'user-001', portfolio_data: { daily_returns: aliceReturns } },
          { user_id: 'user-002', portfolio_data: {} }, // No returns
          { user_id: 'user-003', portfolio_data: { daily_returns: [] } }, // Empty
        ],
        error: null,
      });

      const result = await service.getLeaderboard('sharpe', '1m');

      // Only user-001 has valid returns
      expect(result.total_participants).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // getUserRank
  // --------------------------------------------------------------------------

  describe('getUserRank', () => {
    it('returns the user entry with rank and percentile', async () => {
      const entry = await service.getUserRank('user-001', 'sharpe', '3m');

      expect(entry).not.toBeNull();
      expect(entry!.user_id).toBe('user-001');
      expect(entry!.rank).toBeGreaterThanOrEqual(1);
      expect(entry!.percentile).toBeGreaterThanOrEqual(0);
      expect(entry!.percentile).toBeLessThanOrEqual(100);
    });

    it('returns null for user not on leaderboard', async () => {
      const entry = await service.getUserRank('nonexistent-user', 'sharpe', '1m');
      expect(entry).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getPeriodDays
  // --------------------------------------------------------------------------

  describe('getPeriodDays', () => {
    it('returns correct days for each period', () => {
      expect(service.getPeriodDays('1w')).toBe(5);
      expect(service.getPeriodDays('1m')).toBe(21);
      expect(service.getPeriodDays('3m')).toBe(63);
      expect(service.getPeriodDays('all')).toBe(0);
    });

    it('returns positive number for YTD', () => {
      const ytdDays = service.getPeriodDays('ytd');
      expect(ytdDays).toBeGreaterThan(0);
      // YTD should be between 1 and 252
      expect(ytdDays).toBeLessThanOrEqual(252);
    });
  });

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  describe('configuration', () => {
    it('respects maxEntries config', async () => {
      const limitedService = new LeaderboardService({ maxEntries: 2 });

      const result = await limitedService.getLeaderboard('sharpe', '3m');

      expect(result.entries).toHaveLength(2);
      expect(result.total_participants).toBe(3); // Total is still 3
    });

    it('accepts custom risk-free rate', () => {
      const customService = new LeaderboardService({ riskFreeRate: 0.03 });
      const returns = [0.01, 0.02, -0.005, 0.015, 0.008, -0.01, 0.012];

      const defaultSharpe = service.computeSharpeRatio(returns);
      const customSharpe = customService.computeSharpeRatio(returns);

      // Lower risk-free rate → higher Sharpe (less excess return subtracted)
      expect(customSharpe).toBeGreaterThan(defaultSharpe);
    });
  });
});
