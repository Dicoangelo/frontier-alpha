import { supabaseAdmin, FrontierProfile, FrontierFollow } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export interface ProfileWithCounts extends FrontierProfile {
  follower_count: number;
  following_count: number;
}

export interface CreateProfileInput {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  is_public?: boolean;
}

export interface UpdateProfileInput {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  is_public?: boolean;
}

export class ProfileService {
  async getProfile(userId: string): Promise<FrontierProfile | null> {
    const { data, error } = await supabaseAdmin
      .from('frontier_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error({ err: error, userId }, 'Error fetching profile');
      return null;
    }

    return data;
  }

  async getProfileWithCounts(userId: string): Promise<ProfileWithCounts | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const [followerResult, followingResult] = await Promise.all([
      supabaseAdmin
        .from('frontier_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabaseAdmin
        .from('frontier_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ]);

    return {
      ...profile,
      follower_count: followerResult.count ?? 0,
      following_count: followingResult.count ?? 0,
    };
  }

  async getPublicProfile(userId: string): Promise<FrontierProfile | null> {
    const { data, error } = await supabaseAdmin
      .from('frontier_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_public', true)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  async createProfile(userId: string, input: CreateProfileInput): Promise<FrontierProfile | null> {
    const { data, error } = await supabaseAdmin
      .from('frontier_profiles')
      .insert({
        user_id: userId,
        display_name: input.display_name ?? null,
        avatar_url: input.avatar_url ?? null,
        bio: input.bio ?? null,
        is_public: input.is_public ?? true,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId }, 'Error creating profile');
      return null;
    }

    return data;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<FrontierProfile | null> {
    const updates: Record<string, unknown> = {};
    if (input.display_name !== undefined) updates.display_name = input.display_name;
    if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.is_public !== undefined) updates.is_public = input.is_public;

    if (Object.keys(updates).length === 0) {
      return this.getProfile(userId);
    }

    const { data, error } = await supabaseAdmin
      .from('frontier_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId }, 'Error updating profile');
      return null;
    }

    return data;
  }

  async deleteProfile(userId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('frontier_profiles')
      .delete()
      .eq('user_id', userId);

    if (error) {
      logger.error({ err: error, userId }, 'Error deleting profile');
      return false;
    }

    return true;
  }

  async followUser(followerId: string, followingId: string): Promise<FrontierFollow | null> {
    if (followerId === followingId) {
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from('frontier_follows')
      .insert({
        follower_id: followerId,
        following_id: followingId,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, followerId, followingId }, 'Error following user');
      return null;
    }

    return data;
  }

  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('frontier_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);

    if (error) {
      logger.error({ err: error, followerId, followingId }, 'Error unfollowing user');
      return false;
    }

    return true;
  }

  async getFollowers(userId: string): Promise<FrontierProfile[]> {
    const { data: follows, error: followsError } = await supabaseAdmin
      .from('frontier_follows')
      .select('follower_id')
      .eq('following_id', userId);

    if (followsError || !follows || follows.length === 0) {
      return [];
    }

    const followerIds = follows.map((f: { follower_id: string }) => f.follower_id);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('frontier_profiles')
      .select('*')
      .in('user_id', followerIds);

    if (profilesError) {
      logger.error({ err: profilesError, userId }, 'Error fetching follower profiles');
      return [];
    }

    return profiles || [];
  }

  async getFollowing(userId: string): Promise<FrontierProfile[]> {
    const { data: follows, error: followsError } = await supabaseAdmin
      .from('frontier_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followsError || !follows || follows.length === 0) {
      return [];
    }

    const followingIds = follows.map((f: { following_id: string }) => f.following_id);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('frontier_profiles')
      .select('*')
      .in('user_id', followingIds);

    if (profilesError) {
      logger.error({ err: profilesError, userId }, 'Error fetching following profiles');
      return [];
    }

    return profiles || [];
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('frontier_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single();

    return !!data;
  }

  async searchProfiles(query: string, limit = 20): Promise<FrontierProfile[]> {
    const { data, error } = await supabaseAdmin
      .from('frontier_profiles')
      .select('*')
      .eq('is_public', true)
      .ilike('display_name', `%${query}%`)
      .limit(limit);

    if (error) {
      logger.error({ err: error, query }, 'Error searching profiles');
      return [];
    }

    return data || [];
  }
}

export const profileService = new ProfileService();
