/**
 * Unit Tests for SharingService (Portfolio Sharing)
 *
 * Tests share/unshare/get operations with visibility settings.
 * Supabase client is fully mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mock Supabase before any imports that use it
// ============================================================================

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Chainable query builder mock — all methods return the builder (chainable),
// and the builder is thenable so awaiting it resolves with the configured value.
function createQueryBuilder(resolvedValue: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'ilike', 'single', 'order', 'limit'];
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  // Terminal method: single resolves
  builder.single.mockResolvedValue(resolvedValue);
  // Make builder thenable — awaiting the chain resolves with the configured value
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return builder;
}

let mockQueryBuilder: ReturnType<typeof createQueryBuilder>;
let mockFromTable: string | undefined;

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      mockFromTable = table;
      return mockQueryBuilder;
    }),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock crypto.randomBytes for deterministic tokens
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))),
}));

import { SharingService } from '../../src/services/SharingService.js';
import { supabaseAdmin } from '../../src/lib/supabase.js';

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_USER_ID = 'user-001';
const TEST_OTHER_USER_ID = 'user-002';
const TEST_SHARE_TOKEN = '61'.repeat(32); // hex of 'a'.repeat(32)

const mockPortfolioData = {
  holdings: [
    { symbol: 'AAPL', shares: 100, weight: 0.4 },
    { symbol: 'MSFT', shares: 50, weight: 0.3 },
  ],
  totalValue: 50000,
  returns: { ytd: 0.12 },
};

const mockSharedPortfolio = {
  id: 'share-001',
  user_id: TEST_USER_ID,
  portfolio_data: mockPortfolioData,
  visibility: 'public',
  share_token: TEST_SHARE_TOKEN,
  created_at: '2026-02-09T00:00:00Z',
};

// ============================================================================
// TESTS
// ============================================================================

describe('SharingService', () => {
  let service: SharingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFromTable = undefined;
    // Restore the default from() implementation (tests that use mockImplementation override it)
    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
      mockFromTable = table;
      return mockQueryBuilder;
    }) as typeof supabaseAdmin.from);
    service = new SharingService();
  });

  // --------------------------------------------------------------------------
  // sharePortfolio
  // --------------------------------------------------------------------------

  describe('sharePortfolio', () => {
    it('creates a shared portfolio with default private visibility', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockSharedPortfolio, error: null });

      const result = await service.sharePortfolio(TEST_USER_ID, {
        portfolio_data: mockPortfolioData,
      });

      expect(result).toEqual(mockSharedPortfolio);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('frontier_shared_portfolios');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
          portfolio_data: mockPortfolioData,
          visibility: 'private',
        })
      );
    });

    it('creates a shared portfolio with specified visibility', async () => {
      const publicShare = { ...mockSharedPortfolio, visibility: 'followers' };
      mockQueryBuilder = createQueryBuilder({ data: publicShare, error: null });

      const result = await service.sharePortfolio(TEST_USER_ID, {
        portfolio_data: mockPortfolioData,
        visibility: 'followers',
      });

      expect(result).toEqual(publicShare);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'followers' })
      );
    });

    it('generates a unique share token', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockSharedPortfolio, error: null });

      await service.sharePortfolio(TEST_USER_ID, { portfolio_data: mockPortfolioData });

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          share_token: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      );
    });

    it('returns null on database error', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'insert error', code: '23505' },
      });

      const result = await service.sharePortfolio(TEST_USER_ID, {
        portfolio_data: mockPortfolioData,
      });

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // unsharePortfolio
  // --------------------------------------------------------------------------

  describe('unsharePortfolio', () => {
    it('deletes shared portfolio and returns true', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: null });

      const result = await service.unsharePortfolio(TEST_USER_ID, 'share-001');

      expect(result).toBe(true);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('frontier_shared_portfolios');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'share-001');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
    });

    it('returns false on database error', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'delete error' },
      });

      const result = await service.unsharePortfolio(TEST_USER_ID, 'share-001');

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getSharedByToken
  // --------------------------------------------------------------------------

  describe('getSharedByToken', () => {
    it('returns public shared portfolio without requester', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockSharedPortfolio, error: null });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN);

      expect(result).toEqual(mockSharedPortfolio);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('share_token', TEST_SHARE_TOKEN);
    });

    it('returns private shared portfolio (link-only access)', async () => {
      const privateShare = { ...mockSharedPortfolio, visibility: 'private' };
      mockQueryBuilder = createQueryBuilder({ data: privateShare, error: null });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN);

      expect(result).toEqual(privateShare);
    });

    it('returns null for followers-only share without requester', async () => {
      const followersShare = { ...mockSharedPortfolio, visibility: 'followers' };
      mockQueryBuilder = createQueryBuilder({ data: followersShare, error: null });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN);

      expect(result).toBeNull();
    });

    it('returns followers-only share when requester is a follower', async () => {
      const followersShare = { ...mockSharedPortfolio, visibility: 'followers' };
      // First call returns the share, second call checks follow relationship
      let callCount = 0;
      const shareBuilder = createQueryBuilder({ data: followersShare, error: null });
      const followBuilder = createQueryBuilder({ data: { id: 'follow-001' }, error: null });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        mockFromTable = table;
        if (callCount === 0) {
          callCount++;
          return shareBuilder as unknown as ReturnType<typeof supabaseAdmin.from>;
        }
        return followBuilder as unknown as ReturnType<typeof supabaseAdmin.from>;
      });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN, TEST_OTHER_USER_ID);

      expect(result).toEqual(followersShare);
    });

    it('returns followers-only share when requester is the owner', async () => {
      const followersShare = { ...mockSharedPortfolio, visibility: 'followers' };
      mockQueryBuilder = createQueryBuilder({ data: followersShare, error: null });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN, TEST_USER_ID);

      expect(result).toEqual(followersShare);
    });

    it('returns null for followers-only share when requester is not a follower', async () => {
      const followersShare = { ...mockSharedPortfolio, visibility: 'followers' };
      let callCount = 0;
      const shareBuilder = createQueryBuilder({ data: followersShare, error: null });
      const noFollowBuilder = createQueryBuilder({ data: null, error: { message: 'not found' } });

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        mockFromTable = table;
        if (callCount === 0) {
          callCount++;
          return shareBuilder as unknown as ReturnType<typeof supabaseAdmin.from>;
        }
        return noFollowBuilder as unknown as ReturnType<typeof supabaseAdmin.from>;
      });

      const result = await service.getSharedByToken(TEST_SHARE_TOKEN, TEST_OTHER_USER_ID);

      expect(result).toBeNull();
    });

    it('returns null when token not found', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'No rows found', code: 'PGRST116' },
      });

      const result = await service.getSharedByToken('nonexistent-token');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getUserShares
  // --------------------------------------------------------------------------

  describe('getUserShares', () => {
    it('returns all shared portfolios for a user', async () => {
      const shares = [mockSharedPortfolio, { ...mockSharedPortfolio, id: 'share-002', visibility: 'private' }];
      mockQueryBuilder = createQueryBuilder({ data: shares, error: null });

      const result = await service.getUserShares(TEST_USER_ID);

      expect(result).toEqual(shares);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('returns empty array on error', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: { message: 'fetch error' } });

      const result = await service.getUserShares(TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // updateShare
  // --------------------------------------------------------------------------

  describe('updateShare', () => {
    it('updates visibility of a shared portfolio', async () => {
      const updated = { ...mockSharedPortfolio, visibility: 'followers' };
      mockQueryBuilder = createQueryBuilder({ data: updated, error: null });

      const result = await service.updateShare(TEST_USER_ID, 'share-001', { visibility: 'followers' });

      expect(result).toEqual(updated);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ visibility: 'followers' });
    });

    it('returns existing share when no fields to update', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockSharedPortfolio, error: null });

      const result = await service.updateShare(TEST_USER_ID, 'share-001', {});

      // Should call getShareById (select), not update
      expect(result).toEqual(mockSharedPortfolio);
    });
  });
});
