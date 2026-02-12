/**
 * Unit Tests for ProfileService (Social Profiles & Follow System)
 *
 * Tests CRUD operations for profiles and follow/unfollow functionality.
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
  // select with head option returns count
  builder.select.mockImplementation((_cols?: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      return { ...builder, count: resolvedValue.count ?? 0, then: builder.then } as unknown;
    }
    return builder;
  });
  // Make builder thenable — awaiting the chain resolves with the configured value
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return builder;
}

let mockQueryBuilder: ReturnType<typeof createQueryBuilder>;

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => mockQueryBuilder),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { ProfileService } from '../../src/services/ProfileService.js';
import { supabaseAdmin } from '../../src/lib/supabase.js';

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_USER_ID = 'user-001';
const TEST_OTHER_USER_ID = 'user-002';

const mockProfile = {
  id: 'profile-001',
  user_id: TEST_USER_ID,
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.png',
  bio: 'A test user profile',
  is_public: true,
  created_at: '2026-02-09T00:00:00Z',
  updated_at: '2026-02-09T00:00:00Z',
};

const mockOtherProfile = {
  id: 'profile-002',
  user_id: TEST_OTHER_USER_ID,
  display_name: 'Other User',
  avatar_url: null,
  bio: null,
  is_public: true,
  created_at: '2026-02-09T00:00:00Z',
  updated_at: '2026-02-09T00:00:00Z',
};

const mockFollow = {
  id: 'follow-001',
  follower_id: TEST_USER_ID,
  following_id: TEST_OTHER_USER_ID,
  created_at: '2026-02-09T00:00:00Z',
};

// ============================================================================
// TESTS
// ============================================================================

describe('ProfileService', () => {
  let service: ProfileService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProfileService();
  });

  // --------------------------------------------------------------------------
  // getProfile
  // --------------------------------------------------------------------------

  describe('getProfile', () => {
    it('returns profile for a valid user', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockProfile, error: null });

      const result = await service.getProfile(TEST_USER_ID);

      expect(result).toEqual(mockProfile);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('frontier_profiles');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
      expect(mockQueryBuilder.single).toHaveBeenCalled();
    });

    it('returns null when profile not found', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'No rows found', code: 'PGRST116' },
      });

      const result = await service.getProfile(TEST_USER_ID);

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // createProfile
  // --------------------------------------------------------------------------

  describe('createProfile', () => {
    it('creates a profile with provided fields', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockProfile, error: null });

      const result = await service.createProfile(TEST_USER_ID, {
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'A test user profile',
      });

      expect(result).toEqual(mockProfile);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('frontier_profiles');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        user_id: TEST_USER_ID,
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'A test user profile',
        is_public: true,
      });
    });

    it('creates a profile with defaults when no input provided', async () => {
      const defaultProfile = { ...mockProfile, display_name: null, avatar_url: null, bio: null };
      mockQueryBuilder = createQueryBuilder({ data: defaultProfile, error: null });

      const result = await service.createProfile(TEST_USER_ID, {});

      expect(result).toEqual(defaultProfile);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        user_id: TEST_USER_ID,
        display_name: null,
        avatar_url: null,
        bio: null,
        is_public: true,
      });
    });

    it('returns null on database error', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      });

      const result = await service.createProfile(TEST_USER_ID, { display_name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // updateProfile
  // --------------------------------------------------------------------------

  describe('updateProfile', () => {
    it('updates specified fields only', async () => {
      const updated = { ...mockProfile, display_name: 'Updated Name' };
      mockQueryBuilder = createQueryBuilder({ data: updated, error: null });

      const result = await service.updateProfile(TEST_USER_ID, { display_name: 'Updated Name' });

      expect(result).toEqual(updated);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ display_name: 'Updated Name' });
    });

    it('returns existing profile when no fields to update', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockProfile, error: null });

      const result = await service.updateProfile(TEST_USER_ID, {});

      // Should call getProfile (select), not update
      expect(result).toEqual(mockProfile);
    });
  });

  // --------------------------------------------------------------------------
  // deleteProfile
  // --------------------------------------------------------------------------

  describe('deleteProfile', () => {
    it('deletes profile and returns true', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: null });

      const result = await service.deleteProfile(TEST_USER_ID);

      expect(result).toBe(true);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('frontier_profiles');
    });
  });

  // --------------------------------------------------------------------------
  // followUser / unfollowUser
  // --------------------------------------------------------------------------

  describe('followUser', () => {
    it('creates a follow relationship', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockFollow, error: null });

      const result = await service.followUser(TEST_USER_ID, TEST_OTHER_USER_ID);

      expect(result).toEqual(mockFollow);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        follower_id: TEST_USER_ID,
        following_id: TEST_OTHER_USER_ID,
      });
    });

    it('prevents self-follow', async () => {
      const result = await service.followUser(TEST_USER_ID, TEST_USER_ID);

      expect(result).toBeNull();
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('returns null on duplicate follow error', async () => {
      mockQueryBuilder = createQueryBuilder({
        data: null,
        error: { message: 'duplicate key value violates unique constraint', code: '23505' },
      });

      const result = await service.followUser(TEST_USER_ID, TEST_OTHER_USER_ID);

      expect(result).toBeNull();
    });
  });

  describe('unfollowUser', () => {
    it('removes follow relationship and returns true', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: null });

      const result = await service.unfollowUser(TEST_USER_ID, TEST_OTHER_USER_ID);

      expect(result).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // isFollowing
  // --------------------------------------------------------------------------

  describe('isFollowing', () => {
    it('returns true when follow exists', async () => {
      mockQueryBuilder = createQueryBuilder({ data: { id: 'follow-001' }, error: null });

      const result = await service.isFollowing(TEST_USER_ID, TEST_OTHER_USER_ID);

      expect(result).toBe(true);
    });

    it('returns false when follow does not exist', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: { message: 'not found' } });

      const result = await service.isFollowing(TEST_USER_ID, TEST_OTHER_USER_ID);

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getPublicProfile
  // --------------------------------------------------------------------------

  describe('getPublicProfile', () => {
    it('returns public profile', async () => {
      mockQueryBuilder = createQueryBuilder({ data: mockProfile, error: null });

      const result = await service.getPublicProfile(TEST_USER_ID);

      expect(result).toEqual(mockProfile);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('is_public', true);
    });

    it('returns null for private profile', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: { message: 'not found' } });

      const result = await service.getPublicProfile(TEST_USER_ID);

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // searchProfiles
  // --------------------------------------------------------------------------

  describe('searchProfiles', () => {
    it('searches public profiles by display name', async () => {
      mockQueryBuilder = createQueryBuilder({ data: [mockProfile, mockOtherProfile], error: null });

      const result = await service.searchProfiles('User');

      expect(result).toEqual([mockProfile, mockOtherProfile]);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('is_public', true);
      expect(mockQueryBuilder.ilike).toHaveBeenCalledWith('display_name', '%User%');
    });

    it('returns empty array on error', async () => {
      mockQueryBuilder = createQueryBuilder({ data: null, error: { message: 'search error' } });

      const result = await service.searchProfiles('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
