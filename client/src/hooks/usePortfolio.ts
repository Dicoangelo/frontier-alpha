import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { portfolioApi } from '@/api/portfolio';
import { useAuthStore } from '@/stores/authStore';

export interface PortfolioPosition {
  id: string;
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export interface PortfolioSnapshot {
  id: string;
  name: string;
  cash: number;
  positions: PortfolioPosition[];
  totalValue: number;
  currency?: string;
}

/** Shared prefix: position mutations invalidate every account-scoped snapshot. */
export const PORTFOLIO_QUERY_KEY = ['portfolio'] as const;

/**
 * Normalise either `{ success, data: {...} }` (what `api.get` returns, since the
 * axios interceptor unwraps only the HTTP layer) or the bare portfolio object
 * (what `portfolioApi.getPortfolio` returns) to the bare object.
 *
 * Why this exists: eight components share the `['portfolio']` query key but
 * were split between two queryFns returning the two shapes. Whichever fetched
 * first populated the cache, and every consumer expecting the other shape
 * read `undefined` — the Portfolio page showed "$0 cash / No positions yet"
 * for a funded account because OnboardingProvider had already cached the bare
 * shape under the same key. Silent, order-dependent, and invisible to tests
 * that render one page at a time.
 */
export function unwrapPortfolio(payload: unknown): PortfolioSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const inner = 'success' in obj && obj.data && typeof obj.data === 'object' ? obj.data : obj;
  const p = inner as Partial<PortfolioSnapshot>;
  if (!Array.isArray(p.positions)) return null;
  return {
    id: String(p.id ?? ''),
    name: String(p.name ?? 'My Portfolio'),
    cash: Number(p.cash ?? 0),
    positions: p.positions as PortfolioPosition[],
    totalValue: Number(p.totalValue ?? 0),
    currency: p.currency,
  };
}

export async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot | null> {
  // portfolioApi.getPortfolio already returns body.data (bare); unwrapPortfolio
  // is still applied so a future change to that module cannot reintroduce the
  // shape split.
  return unwrapPortfolio(await portfolioApi.getPortfolio());
}

type Options = Omit<UseQueryOptions<PortfolioSnapshot | null>, 'queryKey' | 'queryFn'>;

/**
 * Canonical portfolio query. Auth-gated (US-003) so it never races session
 * hydration, and normalised so `data` is always the bare snapshot no matter
 * which consumer populated the cache first.
 */
export function usePortfolio(options: Options = {}) {
  const isReady = useAuthStore((s) => s.isReady);
  const session = useAuthStore((s) => s.session);
  const authReady = isReady && !!session?.access_token;
  const { enabled = true, ...rest } = options;

  return useQuery<PortfolioSnapshot | null>({
    // Account identity prevents a sign-in/sign-out or account switch from
    // displaying the previous user's cached holdings. Prefix invalidations
    // (['portfolio']) continue to refresh every consumer.
    queryKey: [...PORTFOLIO_QUERY_KEY, session?.user?.id ?? null],
    queryFn: fetchPortfolioSnapshot,
    enabled: authReady && enabled,
    ...rest,
  });
}
