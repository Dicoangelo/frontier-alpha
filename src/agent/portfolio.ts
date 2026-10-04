import { supabaseAdmin } from '../lib/supabase.js';

export interface ResearchPortfolio {
  cashBalance: number;
  updatedAt: string | null;
  positions: Array<{ symbol: string; shares: number; avgCost: number }>;
}

/** Existing account tables, strictly scoped by the verified actor; never creates a portfolio. */
export async function readResearchPortfolio(actorId: string, signal: AbortSignal): Promise<ResearchPortfolio | null> {
  const { data: portfolios, error } = await supabaseAdmin.from('frontier_portfolios')
    .select('id, cash_balance, updated_at').eq('user_id', actorId).limit(2).abortSignal(signal);
  if (error) throw new Error('Portfolio read unavailable');
  if (!portfolios?.length) return null;
  // The existing product expects one main portfolio. Do not pick an arbitrary account.
  if (portfolios.length !== 1) throw new Error('Portfolio selection is ambiguous');
  const portfolio = portfolios[0];
  const { data: positions, error: positionError } = await supabaseAdmin.from('frontier_positions')
    .select('symbol, shares, avg_cost').eq('portfolio_id', portfolio.id).order('symbol').limit(201).abortSignal(signal);
  if (positionError || !positions || positions.length > 200) throw new Error('Complete positions unavailable');
  const rows = positions.map(row => ({ symbol: row.symbol, shares: Number(row.shares), avgCost: Number(row.avg_cost) }));
  if (!Number.isFinite(Number(portfolio.cash_balance)) || rows.some(row =>
    typeof row.symbol !== 'string' || !Number.isFinite(row.shares) || !Number.isFinite(row.avgCost))) {
    throw new Error('Portfolio values unavailable');
  }
  return { cashBalance: Number(portfolio.cash_balance), updatedAt: portfolio.updated_at ?? null, positions: rows };
}
