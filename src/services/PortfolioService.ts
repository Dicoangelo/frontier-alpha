import { supabaseAdmin, FrontierPortfolio, FrontierPosition } from '../lib/supabase.js';
import type { Portfolio, Position } from '../types/index.js';
import { logger } from '../lib/logger.js';

export interface PortfolioWithPositions extends FrontierPortfolio {
  positions: FrontierPosition[];
}

/**
 * Cash balance a brand-new portfolio starts with. Matches the "$100K starting
 * cash" convention the Trade page and SimulatedBroker already advertise, so a
 * fresh account sees one consistent number everywhere. `addPosition` treats a
 * buy as cash-out, so a zero default would drive cash negative on the very
 * first position.
 */
export const DEFAULT_STARTING_CASH = 100_000;

export class PortfolioService {
  /**
   * Return the user's portfolio, creating it on first touch.
   *
   * Nothing else in the system ever inserted a `frontier_portfolios` row —
   * not signup, not the welcome flow, not the position routes — so every new
   * account hit `getPortfolio() === null`: GET /portfolio 404'd, the
   * Dashboard fell back to the $125K demo fixture under a LIVE badge, the
   * Portfolio page rendered "Couldn't load data", and `addPosition` returned
   * null (400 "Failed to add position"). A new user literally could not add
   * a position. Creating the row lazily here closes that hole for every
   * caller at once.
   *
   * Race-safe: the unique (user_id, name) constraint means a concurrent
   * first request may win the insert; on conflict we simply re-read.
   */
  async ensurePortfolio(userId: string): Promise<PortfolioWithPositions | null> {
    const existing = await this.getPortfolio(userId);
    if (existing) return existing;

    const { error } = await supabaseAdmin
      .from('frontier_portfolios')
      .insert({
        user_id: userId,
        name: 'Main Portfolio',
        cash_balance: DEFAULT_STARTING_CASH,
      });

    // 23505 = unique_violation: another request created it first — fine.
    if (error && error.code !== '23505') {
      logger.error({ err: error, userId }, 'Error creating portfolio');
      return null;
    }

    return this.getPortfolio(userId);
  }

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
    // Pull cash_balance alongside id so we can decrement it after the
    // position write succeeds. Adding a position is a buy; cash must
    // decrease by `shares * avgCost`. The sell path (sellPosition below)
    // already does the symmetric increment, but addPosition was leaving
    // cash untouched — visible in production 2026-05-10 as "$100k cash"
    // even after a $45k buy.
    //
    // ensurePortfolio (not a bare select): a first-ever position must create
    // the portfolio row, otherwise new accounts can never add anything.
    const portfolio = await this.ensurePortfolio(userId);

    if (!portfolio) return null;

    const cashCost = shares * avgCost;
    const newCashBalance = Number(portfolio.cash_balance) - cashCost;

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

      // Decrement cash_balance for the new shares being added
      await supabaseAdmin
        .from('frontier_portfolios')
        .update({ cash_balance: newCashBalance })
        .eq('id', portfolio.id);

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

    // Decrement cash_balance for the cost of the new position
    await supabaseAdmin
      .from('frontier_portfolios')
      .update({ cash_balance: newCashBalance })
      .eq('id', portfolio.id);

    return data;
  }

  async updatePosition(
    userId: string,
    positionId: string,
    shares: number,
    avgCost: number
  ): Promise<FrontierPosition | null> {
    // Verify ownership and pull cash_balance for the delta calc
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id, cash_balance')
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

    // Cash-balance delta: editing shares/avgCost is implicitly a buy (cost
    // increased) or sell (cost decreased). Symmetric with addPosition +
    // sellPosition. Without this, edits silently drift cash.
    const oldCost = Number(position.shares) * Number(position.avg_cost);
    const newCost = shares * avgCost;
    const cashDelta = newCost - oldCost;
    if (Math.abs(cashDelta) > 0.001) {
      const newCashBalance = Number(portfolio.cash_balance) - cashDelta;
      await supabaseAdmin
        .from('frontier_portfolios')
        .update({ cash_balance: newCashBalance })
        .eq('id', portfolio.id);
    }

    return data;
  }

  async deletePosition(userId: string, positionId: string): Promise<boolean> {
    // Verify ownership + pull cash_balance
    const { data: portfolio } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id, cash_balance')
      .eq('user_id', userId)
      .single();

    if (!portfolio) return false;

    // Read the position FIRST so we can credit cash for the cost basis on
    // delete (treated as a sell at avg_cost). Without this, deleting
    // positions silently drifts cash downward.
    const { data: position } = await supabaseAdmin
      .from('frontier_positions')
      .select('shares, avg_cost')
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id)
      .single();

    if (!position) return false;

    const { error } = await supabaseAdmin
      .from('frontier_positions')
      .delete()
      .eq('id', positionId)
      .eq('portfolio_id', portfolio.id);

    if (error) {
      logger.error({ err: error, userId, positionId }, 'Error deleting position');
      return false;
    }

    // Credit cash with the cost basis of the deleted position
    const cashCredit = Number(position.shares) * Number(position.avg_cost);
    if (cashCredit > 0.001) {
      await supabaseAdmin
        .from('frontier_portfolios')
        .update({ cash_balance: Number(portfolio.cash_balance) + cashCredit })
        .eq('id', portfolio.id);
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
