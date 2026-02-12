import { supabaseAdmin, FrontierPortfolio, FrontierPosition } from '../lib/supabase.js';
import type { Portfolio, Position } from '../types/index.js';
import { logger } from '../lib/logger.js';

export interface PortfolioWithPositions extends FrontierPortfolio {
  positions: FrontierPosition[];
}

export class PortfolioService {
  async getPortfolio(userId: string): Promise<PortfolioWithPositions | null> {
    const { data: portfolio, error: portfolioError } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (portfolioError || !portfolio) {
      return null;
    }

    const { data: positions, error: positionsError } = await supabaseAdmin
      .from('frontier_positions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .order('symbol');

    if (positionsError) {
      logger.error({ err: positionsError, userId }, 'Error fetching positions');
    }

    return {
      ...portfolio,
      positions: positions || [],
    };
  }

  async updateCashBalance(userId: string, cashBalance: number): Promise<FrontierPortfolio | null> {
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return null;

    const { data, error } = await supabaseAdmin
      .from('frontier_portfolios')
      .update({ cash_balance: cashBalance })
      .eq('id', portfolio.id)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId }, 'Error updating cash balance');
      return null;
    }

    return data;
  }

  async addPosition(
    userId: string,
    symbol: string,
    shares: number,
    avgCost: number
  ): Promise<FrontierPosition | null> {
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return null;

    // Check if position already exists
    const { data: existing } = await supabaseAdmin
      .from('frontier_positions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (existing) {
      // Update existing position (average the cost basis)
      const totalShares = Number(existing.shares) + shares;
      const totalCost = Number(existing.shares) * Number(existing.avg_cost) + shares * avgCost;
      const newAvgCost = totalCost / totalShares;

      const { data, error } = await supabaseAdmin
        .from('frontier_positions')
        .update({
          shares: totalShares,
          avg_cost: newAvgCost,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, symbol }, 'Error updating existing position');
        return null;
      }

      return data;
    }

    // Create new position
    const { data, error } = await supabaseAdmin
      .from('frontier_positions')
      .insert({
        portfolio_id: portfolio.id,
        symbol: symbol.toUpperCase(),
        shares,
        avg_cost: avgCost,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, symbol }, 'Error adding position');
      return null;
    }

    return data;
  }

  async updatePosition(
    userId: string,
    positionId: string,
    shares: number,
    avgCost: number
  ): Promise<FrontierPosition | null> {
    // Verify ownership
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return null;

    const { data: position } = await supabaseAdmin
      .from('frontier_positions')
      .select('*')
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id)
      .single();

    if (!position) return null;

    const { data, error } = await supabaseAdmin
      .from('frontier_positions')
      .update({ shares, avg_cost: avgCost })
      .eq('id', positionId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, positionId }, 'Error updating position');
      return null;
    }

    return data;
  }

  async deletePosition(userId: string, positionId: string): Promise<boolean> {
    // Verify ownership
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return false;

    const { error } = await supabaseAdmin
      .from('frontier_positions')
      .delete()
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id);

    if (error) {
      logger.error({ err: error, userId, positionId }, 'Error deleting position');
      return false;
    }

    return true;
  }

  async sellPosition(
    userId: string,
    positionId: string,
    sharesToSell: number
  ): Promise<{ position: FrontierPosition | null; cashProceeds: number }> {
    // Verify ownership
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return { position: null, cashProceeds: 0 };

    const { data: position } = await supabaseAdmin
      .from('frontier_positions')
      .select('*')
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id)
      .single();

    if (!position) return { position: null, cashProceeds: 0 };

    const currentShares = Number(position.shares);
    if (sharesToSell > currentShares) {
      return { position: null, cashProceeds: 0 };
    }

    const cashProceeds = sharesToSell * Number(position.avg_cost); // Simplified - should use current price

    if (sharesToSell === currentShares) {
      // Delete the position
      await supabaseAdmin
        .from('frontier_positions')
        .delete()
        .eq('id', positionId);

      // Update cash balance
      await supabaseAdmin
        .from('frontier_portfolios')
        .update({ cash_balance: Number(portfolio.cash_balance) + cashProceeds })
        .eq('id', portfolio.id);

      return { position: null, cashProceeds };
    }

    // Update position with remaining shares
    const { data: updatedPosition } = await supabaseAdmin
      .from('frontier_positions')
      .update({ shares: currentShares - sharesToSell })
      .eq('id', positionId)
      .select()
      .single();

    // Update cash balance
    await supabaseAdmin
      .from('frontier_portfolios')
      .update({ cash_balance: Number(portfolio.cash_balance) + cashProceeds })
      .eq('id', portfolio.id);

    return { position: updatedPosition, cashProceeds };
  }

  // Convert DB format to API format
  toAPIFormat(dbPortfolio: PortfolioWithPositions, quotes: Map<string, number>): Portfolio {
    const positions: Position[] = dbPortfolio.positions.map((p) => {
      const currentPrice = quotes.get(p.symbol) || Number(p.avg_cost);
      const shares = Number(p.shares);
      const avgCost = Number(p.avg_cost);
      const marketValue = shares * currentPrice;
      const costBasis = shares * avgCost;

      return {
        id: p.id,
        symbol: p.symbol,
        shares,
        weight: 0, // Will be calculated after total value is known
        costBasis: avgCost,
        currentPrice,
        unrealizedPnL: marketValue - costBasis,
      };
    });

    const totalPositionValue = positions.reduce(
      (sum, p) => sum + p.shares * p.currentPrice,
      0
    );
    const cashBalance = Number(dbPortfolio.cash_balance);
    const totalValue = totalPositionValue + cashBalance;

    // Calculate weights
    positions.forEach((p) => {
      p.weight = (p.shares * p.currentPrice) / totalValue;
    });

    return {
      id: dbPortfolio.id,
      name: dbPortfolio.name,
      positions,
      cash: cashBalance,
      totalValue,
      currency: 'USD',
    };
  }
}

export const portfolioService = new PortfolioService();
