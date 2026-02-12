import { randomBytes } from 'crypto';
import { supabaseAdmin, FrontierSharedPortfolio, SharedPortfolioVisibility } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export interface SharePortfolioInput {
  portfolio_data: Record<string, unknown>;
  visibility?: SharedPortfolioVisibility;
}

export interface UpdateShareInput {
  portfolio_data?: Record<string, unknown>;
  visibility?: SharedPortfolioVisibility;
}

function generateShareToken(): string {
  return randomBytes(32).toString('hex');
}

export class SharingService {
  async sharePortfolio(userId: string, input: SharePortfolioInput): Promise<FrontierSharedPortfolio | null> {
    const shareToken = generateShareToken();

    const { data, error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .insert({
        user_id: userId,
        portfolio_data: input.portfolio_data,
        visibility: input.visibility ?? 'private',
        share_token: shareToken,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId }, 'Error sharing portfolio');
      return null;
    }

    return data;
  }

  async unsharePortfolio(userId: string, shareId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .delete()
      .eq('id', shareId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ err: error, userId, shareId }, 'Error unsharing portfolio');
      return false;
    }

    return true;
  }

  async getSharedByToken(token: string, requesterId?: string): Promise<FrontierSharedPortfolio | null> {
    const { data, error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .select('*')
      .eq('share_token', token)
      .single();

    if (error || !data) {
      return null;
    }

    // Public shares are visible to everyone
    if (data.visibility === 'public') {
      return data;
    }

    // Private shares are accessible via the link (token is the secret)
    if (data.visibility === 'private') {
      return data;
    }

    // Followers-only shares require a requester who follows the owner
    if (data.visibility === 'followers') {
      if (!requesterId) {
        return null;
      }

      // Owner can always see their own share
      if (requesterId === data.user_id) {
        return data;
      }

      const { data: follow } = await supabaseAdmin
        .from('frontier_follows')
        .select('id')
        .eq('follower_id', requesterId)
        .eq('following_id', data.user_id)
        .single();

      if (!follow) {
        return null;
      }

      return data;
    }

    return null;
  }

  async getUserShares(userId: string): Promise<FrontierSharedPortfolio[]> {
    const { data, error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ err: error, userId }, 'Error fetching user shares');
      return [];
    }

    return data || [];
  }

  async updateShare(userId: string, shareId: string, input: UpdateShareInput): Promise<FrontierSharedPortfolio | null> {
    const updates: Record<string, unknown> = {};
    if (input.portfolio_data !== undefined) updates.portfolio_data = input.portfolio_data;
    if (input.visibility !== undefined) updates.visibility = input.visibility;

    if (Object.keys(updates).length === 0) {
      return this.getShareById(userId, shareId);
    }

    const { data, error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .update(updates)
      .eq('id', shareId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, shareId }, 'Error updating share');
      return null;
    }

    return data;
  }

  async getShareById(userId: string, shareId: string): Promise<FrontierSharedPortfolio | null> {
    const { data, error } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .select('*')
      .eq('id', shareId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }
}

export const sharingService = new SharingService();
