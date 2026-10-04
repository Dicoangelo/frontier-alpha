import { useState, useEffect, useCallback } from 'react';
import { PaperAccountNotice } from '@/components/trading/PaperAccountNotice';
import {
  BarChart3,
  Activity,
  AlertTriangle,
  Info,
  Link2,
  Unlink,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Settings,
  Shield,
  CheckCircle2,
  CircleDollarSign,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { toast } from '@/components/shared/Toast';
import { TradeExecutor } from '@/components/trading/TradeExecutor';
import { PriceChart } from '@/components/trading/PriceChart';
import {
  useTrading,
  useBrokerPositions,
  useMarketClock,
  useConnectBroker,
  useQuote,
} from '@/hooks/useTrading';
import { useAlpacaStatus } from '@/hooks/useIntegrationsHealth';
import { api, getErrorMessage } from '@/api/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { WorkspaceDialog } from '@/components/trading/WorkspaceDialog';
import '@/components/trading/transaction-workspace.css';

// ─── Active broker mode (read raw integrations payload for `mode`) ──────────
// The shared `useAlpacaStatus()` selector returns only the status flag —
// it strips the `mode` field. We fetch the raw integrations payload here on
// a distinct cache key so we can render the simulated/paper/live broker chip
// + banner without colliding with the existing health hook's cached shape.
type AlpacaBrokerMode = 'simulated' | 'paper' | 'live' | 'unknown';
type AlpacaIntegration = {
  status?: 'live' | 'degraded';
  mode?: AlpacaBrokerMode;
  via?: string | null;
  provider?: string;
  reason?: string;
};

function useAlpacaBrokerMode(): AlpacaBrokerMode {
  const { data } = useQuery<AlpacaBrokerMode>({
    queryKey: ['health', 'integrations', 'raw-alpaca-mode'],
    queryFn: async () => {
      try {
        const payload = (await api.get('/health/integrations')) as
          | { integrations?: { alpaca?: AlpacaIntegration } }
          | undefined;
        const m = payload?.integrations?.alpaca?.mode;
        if (m === 'simulated' || m === 'paper' || m === 'live') return m;
        return 'unknown';
      } catch {
        return 'unknown';
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  return data ?? 'unknown';
}

const PAPER_INTRO_FLAG = 'paper_trading_intro_shown';

// ─── Skeleton for Trading page ───────────────────────────────────────────────
function TradingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] animate-fade-in">
      <div className="max-w-7xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="skeleton-shimmer h-9 w-32 rounded-lg mb-2" />
          <div className="skeleton-shimmer h-4 w-56 rounded" />
        </div>

        {/* Banner skeleton */}
        <div className="skeleton-shimmer h-20 w-full rounded-lg mb-6" />

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2">
            <div className="skeleton-shimmer h-[480px] rounded-xl" />
          </div>
          {/* Sidebar */}
          <div className="space-y-6">
            <div className="skeleton-shimmer h-40 rounded-xl" />
            <div className="skeleton-shimmer h-56 rounded-xl" />
            <div className="skeleton-shimmer h-44 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Trading() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedSymbol = searchParams.get('symbol')?.trim().toUpperCase() ?? '';
  const [selectedSymbol, setSelectedSymbol] = useState(linkedSymbol);
  const session = useAuthStore((state) => state.session);
  const isReadOnly = !session;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow position links on this route
    if (linkedSymbol) setSelectedSymbol(linkedSymbol);
  }, [linkedSymbol]);
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);

  const {
    brokerConnected,
    brokerType,
    paperTrading,
    isLoading,
  } = useTrading();
  const alpacaStatus = useAlpacaStatus();
  const alpacaBrokerMode = useAlpacaBrokerMode();
  // Trading is "live-capable" whenever the integrations endpoint reports
  // status:'live' — that covers both the real Alpaca adapter AND the
  // internal SimulatedBroker. Buy/Sell stay enabled in both cases.
  const alpacaDegraded = alpacaStatus === 'degraded';
  const isSimulated = alpacaStatus === 'live' && alpacaBrokerMode === 'simulated';

  const { data: positionsData, isLoading: positionsLoading, error: positionsError, refetch: refetchPositions } = useBrokerPositions();
  const { data: marketClock } = useMarketClock();
  const { data: selectedQuote, isLoading: quoteLoading, error: quoteError } = useQuote(selectedSymbol);

  const positions = positionsData?.positions || [];

  // First-touch educational toast — only fires the first time a user submits
  // an order against the SimulatedBroker. Gated by localStorage so we don't
  // nag returning users.
  const handleOrderSubmittedFromExecutor = useCallback(() => {
    refetchPositions();
    if (isSimulated && typeof window !== 'undefined') {
      try {
        if (!window.localStorage.getItem(PAPER_INTRO_FLAG)) {
          toast.info(
            'Paper trading active',
            'Orders use delayed quotes and virtual funds. Your paper positions are saved to your account.'
          );
          window.localStorage.setItem(PAPER_INTRO_FLAG, '1');
        }
      } catch {
        // localStorage can throw in private mode / iframes — fail silent.
      }
    }
  }, [refetchPositions, isSimulated]);

  // Header chip label for the active broker.
  let brokerChipLabel = 'OFFLINE';
  if (alpacaStatus === 'live') {
    if (alpacaBrokerMode === 'simulated') {
      brokerChipLabel = 'SIMULATED · DELAYED QUOTES';
    } else if (alpacaBrokerMode === 'paper') {
      brokerChipLabel = 'ALPACA · PAPER';
    } else if (alpacaBrokerMode === 'live') {
      brokerChipLabel = 'ALPACA · LIVE';
    } else {
      brokerChipLabel = 'ALPACA';
    }
  }

  if (isLoading) {
    return <TradingSkeleton />;
  }

  return (
    <div className="transaction-workspace min-h-full" data-testid="visual-trading-ready">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div
          className="mb-8 animate-fade-in-up"
          style={{ animationFillMode: 'both' }}
        >
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Order management
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-bold text-theme">
              <span className="text-gradient-brand">Trade</span>
            </h1>
            {/* Active broker chip — sovereign-gradient outline pill for
                simulated, neutral outline for paper/live, muted for offline. */}
            <span
              role="status"
              aria-label={`Active broker: ${brokerChipLabel}`}
              className={`mono text-[10px] tracking-[0.3em] uppercase px-2.5 py-1 rounded-full border animate-fade-in ${
                isSimulated
                  ? 'border-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] text-gradient-brand bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] shadow-[0_0_18px_-6px_rgba(123,44,255,0.55)]'
                  : alpacaStatus === 'live'
                    ? 'border-[var(--color-border)] text-theme-secondary bg-[var(--color-bg-tertiary)]'
                    : 'border-[var(--color-border)] text-theme-muted bg-[var(--color-bg-tertiary)]'
              }`}
            >
              [{brokerChipLabel}]
            </span>
          </div>
          <p className="text-sm text-theme-secondary mt-1">
            {isSimulated
              ? 'Practice with delayed market quotes and a saved paper portfolio.'
              : 'Execute orders and manage your positions'}
          </p>
        </div>

        {/* Broker-mode banner — three branches:
            1. simulated  → Frontier Alpha paper trading (sovereign rail)
            2. live       → real Alpaca connected (handled below in the
                            connection-status banner; nothing here)
            3. degraded   → no broker wired at all (legacy READ-ONLY DEMO) */}
        {alpacaDegraded ? (
          <div
            role="status"
            aria-live="polite"
            className="glass-slab-floating relative overflow-hidden mb-6 rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)] animate-fade-in-up"
            style={{ animationDelay: '20ms', animationFillMode: 'both' }}
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent-text)]" aria-hidden="true" />
            <div className="flex-1">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent-text)]">
                Trading · Read-Only Demo Mode
              </p>
              <p className="text-sm mt-1 text-theme-secondary">
                Live broker connection (Alpaca) not yet configured. Order tickets are
                visualized but not submitted.
              </p>
            </div>
          </div>
        ) : isSimulated ? (
          <div
            role="status"
            aria-live="polite"
            className="glass-slab-floating relative overflow-hidden mb-6 rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)] animate-fade-in-up"
            style={{ animationDelay: '20ms', animationFillMode: 'both' }}
          >
            <CircleDollarSign className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent-text)]" aria-hidden="true" />
            <div className="flex-1">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent-text)]">
                Paper trading
              </p>
              <p className="text-sm mt-1 text-theme-secondary">
                Quotes are delayed by 15 minutes. Orders use virtual funds.
              </p>
              <PaperAccountNotice />
            </div>
          </div>
        ) : null}

        {/* Connection Status Banner */}
        {!isReadOnly && <div
          className="animate-fade-in-up"
          style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        >
          {!brokerConnected ? (
            <div
              className="glass-slab-floating relative overflow-hidden mb-6 rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)] shadow-[0_18px_60px_-20px_rgba(245,158,11,0.45)]"
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-warning)]" />
              <div className="flex-1">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-warning)]">No Broker Connected</p>
                <p className="text-sm mt-1 text-theme-secondary">
                  Verify your Alpaca credentials. The active trading account is configured for this workspace.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { if (isReadOnly) navigate('/login'); else setShowConnectionSettings(true); }}
                    leftIcon={<Settings className="w-4 h-4" />}
                  >
                    Verify credentials
                  </Button>

                </div>
              </div>
            </div>
          ) : paperTrading ? (
            <div
              className="glass-slab-floating relative overflow-hidden mb-6 rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]"
            >
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent-text)]" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent-text)]">Paper Trading Mode</p>
                  <Badge variant="info">
                    {brokerType === 'alpaca' ? 'Alpaca Paper' : 'Demo'}
                  </Badge>
                </div>
                <p className="text-sm mt-1 text-theme-secondary">
                  All trades are simulated with virtual money. No real funds will be used.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (isReadOnly) navigate('/login'); else setShowConnectionSettings(true); }}
                aria-label="Verify broker credentials"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div
              className="glass-slab-floating relative overflow-hidden mb-6 rounded-xl pl-5 pr-4 py-4 flex items-start gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)] shadow-[0_18px_60px_-20px_rgba(245,158,11,0.45)]"
            >
              <Shield className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-warning)]" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-warning)]">Live Trading</p>
                  <Badge variant="success">Alpaca Live</Badge>
                </div>
                <p className="text-sm mt-1 text-theme-secondary">
                  You are connected to live trading. Real funds will be used for trades.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (isReadOnly) navigate('/login'); else setShowConnectionSettings(true); }}
                aria-label="Verify broker credentials"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>}

        {isReadOnly && <div className="workspace-notice mb-4 flex items-center justify-between gap-4">
          <p>Sign in to view your account, preview orders, and manage positions.</p>
          <Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>
        </div>}
        {/* Main grid */}
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          {/* Trade Executor - Main Column */}
          <div
            className="lg:col-span-2 animate-fade-in-up"
            style={{ animationDelay: '150ms', animationFillMode: 'both' }}
          >
            {(alpacaDegraded || isReadOnly) ? (
              <fieldset
                disabled
                aria-disabled="true"
                title={isReadOnly ? 'Sign in to use the order ticket' : 'Broker is unavailable — order submission is disabled'}
                className="border-0 p-0 m-0 min-w-0 [&_button[type=submit]]:cursor-not-allowed [&_button[type=submit]]:opacity-60"
              >
                <TradeExecutor
                  defaultSymbol={selectedSymbol}
                onSymbolChange={setSelectedSymbol}
                  onOrderSubmitted={handleOrderSubmittedFromExecutor}
                />
              </fieldset>
            ) : (
              // status === 'live' (covers BOTH real Alpaca and the internal
              // SimulatedBroker). Buy/Sell render normally — the simulated
              // broker fills against live Polygon quotes server-side.
              <TradeExecutor
                defaultSymbol={selectedSymbol}
                onSymbolChange={setSelectedSymbol}
                onOrderSubmitted={handleOrderSubmittedFromExecutor}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Market Status */}
            <section
              className="glass-slab rounded-xl p-4 sm:p-6 animate-fade-in-up"
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-2 rounded-lg shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
                >
                  <Clock className="w-4 h-4 text-[var(--color-accent-text)]" />
                </div>
                <div>
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Session</p>
                  <h3 className="text-sm font-bold text-theme">Market Status</h3>
                </div>
              </div>
              <MarketStatusDisplay clock={marketClock} />
            </section>

            {/* Price Chart */}
            {selectedSymbol && (
              <div
                className="animate-fade-in-up"
                style={{ animationDelay: '220ms', animationFillMode: 'both' }}
              >
                <PriceChart
                  symbol={selectedSymbol}
                  currentPrice={selectedQuote?.last}
                  changePercent={selectedQuote?.changePercent}
                  timestamp={selectedQuote?.timestamp}
                  isLoading={quoteLoading}
                  error={isReadOnly ? 'Sign in to view account quotes.' : quoteError ? getErrorMessage(quoteError) : undefined}
                />
              </div>
            )}

            {/* Positions */}
            <section
              className="glass-slab rounded-xl p-4 sm:p-6 animate-fade-in-up"
              style={{ animationDelay: '250ms', animationFillMode: 'both' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
                  >
                    <BarChart3 className="w-4 h-4 text-[var(--color-accent-text)]" />
                  </div>
                  <div>
                    <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">{paperTrading ? 'Paper account' : 'Broker account'} · Holdings</p>
                    <h3 className="text-sm font-bold text-theme">Positions</h3>
                    {paperTrading && <PaperAccountNotice variant="inline" />}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchPositions()}
                  disabled={positionsLoading}
                  aria-label="Refresh positions"
                >
                  <RefreshCw className={`w-4 h-4 ${positionsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                </Button>
              </div>

              {positionsLoading ? (
                <div className="py-6 text-center text-theme-muted">
                  <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Loading positions...</p>
                </div>
              ) : positionsError ? (
                <p role="alert" className="workspace-inline-error">{getErrorMessage(positionsError)}. Use Refresh positions to try again.</p>
              ) : positions.length === 0 ? (
                <div className="py-8 text-center animate-fade-in-up">
                  <div
                    className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    }}
                  >
                    <Activity className="w-5 h-5 text-[var(--color-accent-text)]" aria-hidden="true" />
                  </div>
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
                    HOLDINGS · Empty
                  </p>
                  <p className="text-sm font-semibold text-theme">No positions</p>
                  <p className="text-xs mt-1 text-theme-secondary leading-relaxed max-w-xs mx-auto">
                    Place trades to build your portfolio. Your position returns appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 animate-stagger">
                  {positions.map((position) => {
                    const isSelected = selectedSymbol === position.symbol;
                    const isPositive = position.unrealizedPnL >= 0;
                    return (
                      <button
                        key={position.symbol}
                        onClick={() => setSelectedSymbol(position.symbol)}
                        aria-pressed={isSelected}
                        className={`glass-slab-floating animate-enter w-full p-3 rounded-xl text-left animate-press transition-[border-color,box-shadow] duration-200 relative overflow-hidden ${
                          isSelected
                            ? "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_4px_20px_rgba(123,44,255,0.18)]"
                            : 'hover:border-[var(--color-border-hover)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="mono uppercase font-bold text-theme">
                                {position.symbol}
                              </span>
                              {position.side === 'long' ? (
                                <TrendingUp className="w-3 h-3 text-[var(--color-positive)]" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-[var(--color-negative)]" />
                              )}
                            </div>
                            <p className="mono text-[11px] tabular-nums text-theme-muted mt-0.5">
                              {position.qty} sh @ ${position.avgEntryPrice.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="mono tabular-nums font-semibold text-theme">
                              ${position.currentPrice.toFixed(2)}
                            </p>
                            <p
                              className={`mono text-[11px] tabular-nums mt-0.5 ${
                                isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              ${position.unrealizedPnL.toFixed(2)} ({position.unrealizedPnLPercent.toFixed(2)}%)
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Trading Tips */}
            <section
              className="glass-slab rounded-xl p-4 sm:p-6 animate-fade-in-up"
              style={{ animationDelay: '300ms', animationFillMode: 'both' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-2 rounded-lg shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
                >
                  <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
                </div>
                <div>
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Discipline</p>
                  <h3 className="text-sm font-bold text-theme">Trading Tips</h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-theme-secondary">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-info)]" />
                  Use limit orders for better price control
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-info)]" />
                  Preview orders before submission to check estimated costs
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-info)]" />
                  Check factor exposures before large trades
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-info)]" />
                  Consider earnings dates for volatile stocks
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-info)]" />
                  Review optimization suggestions regularly
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* Connection Settings Modal */}
        {showConnectionSettings && (
          <ConnectionSettingsModal
            onClose={() => setShowConnectionSettings(false)}
            currentBroker={brokerType}
            isPaperTrading={paperTrading}
            isConnected={brokerConnected}
          />
        )}
      </div>
    </div>
  );
}

// ─── Market status display component ─────────────────────────────────────────
function getMarketPhase(now: Date): {
  label: string;
  isOpen: boolean;
  progressPercent: number;
} {
  // Convert current time to ET (UTC-5 in winter, UTC-4 in summer)
  // We use Intl to get the correct ET offset
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const etParts = etFormatter.formatToParts(now);
  const etHour = parseInt(etParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const etMinute = parseInt(etParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const totalMinutesET = etHour * 60 + etMinute;

  // Market hours in minutes from midnight ET
  const preMarketStart = 4 * 60; // 4:00 AM
  const regularOpen = 9 * 60 + 30; // 9:30 AM
  const regularClose = 16 * 60; // 4:00 PM
  const afterHoursEnd = 20 * 60; // 8:00 PM

  let label: string;
  let isOpen = false;
  let progressPercent = 0;

  if (totalMinutesET < preMarketStart || totalMinutesET >= afterHoursEnd) {
    label = 'Closed';
    progressPercent = 0;
  } else if (totalMinutesET < regularOpen) {
    label = 'Pre-Market';
    const elapsed = totalMinutesET - preMarketStart;
    const duration = regularOpen - preMarketStart;
    progressPercent = Math.min(100, (elapsed / duration) * 100);
  } else if (totalMinutesET < regularClose) {
    label = 'Regular Hours';
    isOpen = true;
    const elapsed = totalMinutesET - regularOpen;
    const duration = regularClose - regularOpen; // 390 minutes
    progressPercent = Math.min(100, (elapsed / duration) * 100);
  } else {
    label = 'After Hours';
    const elapsed = totalMinutesET - regularClose;
    const duration = afterHoursEnd - regularClose;
    progressPercent = Math.min(100, (elapsed / duration) * 100);
  }

  return { label, isOpen, progressPercent };
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
}

function MarketStatusDisplay({ clock }: { clock?: { isOpen: boolean; nextOpen: string; nextClose: string } }) {
  const [now, setNow] = useState(() => new Date());
  const [countdown, setCountdown] = useState('--:--:--');

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);

      // Compute countdown to next event
      if (clock) {
        const targetStr = clock.isOpen ? clock.nextClose : clock.nextOpen;
        if (targetStr) {
          const target = new Date(targetStr);
          const diffMs = target.getTime() - current.getTime();
          if (diffMs > 0) {
            setCountdown(formatCountdown(Math.floor(diffMs / 1000)));
          } else {
            setCountdown('00:00:00');
          }
        }
      }
    };

    tick(); // run immediately
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [clock]);

  if (!clock) {
    return <p className="text-sm text-theme-muted">Market status is unavailable. Your account’s market clock will appear when available.</p>;
  }

  const phase = getMarketPhase(now);
  const { label, isOpen, progressPercent } = clock.isOpen
    ? { ...phase, label: 'Regular session', isOpen: true }
    : { label: 'Market closed', isOpen: false, progressPercent: 0 };
  const nextEvent = clock.isOpen ? clock.nextClose : clock.nextOpen;
  const nextEventDate = nextEvent ? new Date(nextEvent) : null;

  // Progress bar color based on phase
  let barColor = 'var(--color-text-muted)';
  if (label === 'Regular Hours') barColor = 'var(--color-positive)';
  else if (label === 'Pre-Market') barColor = 'var(--color-warning)';
  else if (label === 'After Hours') barColor = 'var(--color-info)';

  return (
    <div className="space-y-3">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full flex-shrink-0 ${isOpen ? 'animate-pulse-green' : ''}`}
            style={{ backgroundColor: isOpen ? 'var(--color-positive)' : 'var(--color-negative)' }}
          />
          <span className="mono text-[11px] tracking-[0.2em] uppercase font-semibold text-theme">
            Market {clock.isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        <span
          className="mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full"
          style={{
            color: barColor,
            backgroundColor: `color-mix(in srgb, ${barColor} 12%, transparent)`,
          }}
        >
          {label}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
          <div
            className="h-full rounded-full transition-[width] duration-1000"
            style={{
              width: `${progressPercent}%`,
              background: `linear-gradient(to right, ${barColor}, color-mix(in srgb, ${barColor} 70%, var(--color-accent-secondary)))`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="mono text-[10px] tabular-nums text-theme-muted">
            {label === 'Pre-Market' ? '4:00 AM' : label === 'Regular Hours' ? '9:30 AM' : label === 'After Hours' ? '4:00 PM' : '—'}
          </span>
          <span className="mono text-[10px] tabular-nums text-theme-muted">
            {label === 'Pre-Market' ? '9:30 AM' : label === 'Regular Hours' ? '4:00 PM' : label === 'After Hours' ? '8:00 PM' : '—'}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
        <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
          {clock.isOpen ? 'Closes in' : 'Opens in'}
        </span>
        <span
          className="mono tabular-nums text-sm font-semibold"
          style={{ color: barColor }}
        >
          {countdown}
        </span>
      </div>

      {/* Next event time */}
      {nextEventDate && (
        <p className="text-xs text-theme-secondary">
          {clock.isOpen ? 'Closes' : 'Opens'}:{' '}
          <span className="mono tabular-nums">
            {nextEventDate.toLocaleString('en-US', {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
            })}
          </span>
        </p>
      )}

      <p className="text-xs text-theme-muted">
        Extended hours trading may be available
      </p>
    </div>
  );
}

// ─── Connection settings modal ────────────────────────────────────────────────
function ConnectionSettingsModal({
  onClose,
  currentBroker,
  isPaperTrading,
  isConnected,
}: {
  onClose: () => void;
  currentBroker: string;
  isPaperTrading: boolean;
  isConnected: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [paperTrading, setPaperTrading] = useState(true);
  const connectBroker = useConnectBroker();

  const handleConnect = async () => {
    if (connectBroker.isPending || !apiKey.trim() || !apiSecret.trim()) return;
    setVerificationMessage(null);
    try {
      await connectBroker.mutateAsync({
        broker: 'alpaca',
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        paperTrading,
      });
      setVerificationMessage(`Credentials verified for your ${paperTrading ? 'paper' : 'live'} Alpaca account. The active workspace broker has not changed.`);
    } catch (error) {
      // Surface real error to user — was previously silent (only console.error).
      // Common causes: bad keys, network, Alpaca API down.
      toast.error(
        'Connection failed',
        error instanceof Error ? error.message : 'Could not connect to Alpaca. Check your API keys and try again.',
      );
    }
  };

  return (
    <WorkspaceDialog labelledBy="broker-dialog-title" onClose={onClose} busy={connectBroker.isPending}>
      <form onSubmit={(event) => { event.preventDefault(); void handleConnect(); }} className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">Integrations</p>
            <h2 id="broker-dialog-title" className="text-lg font-bold text-theme">Verify broker credentials</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={connectBroker.isPending}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] rounded animate-press transition-colors duration-200"
            aria-label="Close broker verification"
          >
            <X className="w-5 h-5 text-theme-muted" />
          </button>
        </div>

        {/* Current Status */}
        <div className="mb-6 glass-slab-floating rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            {isConnected ? (
              <Link2 className="w-5 h-5 text-[var(--color-positive)]" />
            ) : (
              <Unlink className="w-5 h-5 text-theme-muted" />
            )}
            <span className="mono text-[10px] tracking-[0.3em] uppercase font-semibold text-theme">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          {isConnected && (
            <p className="text-sm text-theme-secondary">
              Broker: <span className="font-medium capitalize">{currentBroker}</span>
              {isPaperTrading && <Badge variant="info" className="ml-2">Paper</Badge>}
            </p>
          )}
        </div>

        {/* Alpaca Connection Form */}
        <div className="space-y-4 mb-6">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Alpaca</p>
            <h3 className="text-sm font-bold text-theme mt-1">Verify account access</h3>
          </div>
          <p className="text-sm text-theme-secondary">
            This checks your credentials without changing the workspace’s active broker. Get your API keys from{' '}
            <a
              href="https://app.alpaca.markets/paper/dashboard/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-text)] hover:underline animate-press"
            >
              Alpaca Dashboard
            </a>
          </p>

          <div>
            <label htmlFor="alpaca-api-key" className="block text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-2">
              API Key
            </label>
            <input
              id="alpaca-api-key"
              type="password"
              autoComplete="off"
              required
              value={apiKey}
              disabled={connectBroker.isPending}
              onChange={(e) => { setApiKey(e.target.value); setVerificationMessage(null); }}
              placeholder="PK..."
              className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="alpaca-api-secret" className="block text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-2">
              API Secret
            </label>
            <input
              id="alpaca-api-secret"
              type="password"
              autoComplete="off"
              required
              value={apiSecret}
              disabled={connectBroker.isPending}
              onChange={(e) => { setApiSecret(e.target.value); setVerificationMessage(null); }}
              placeholder="Your secret key"
              className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px] animate-press">
            <input
              type="checkbox"
              checked={paperTrading}
              disabled={connectBroker.isPending}
              onChange={(e) => { setPaperTrading(e.target.checked); setVerificationMessage(null); }}
              className="w-5 h-5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
            />
            <span className="text-sm text-theme-secondary">Verify a paper account</span>
          </label>

          {!paperTrading && (
            <div className="glass-slab-floating relative overflow-hidden rounded-xl p-3 text-sm before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]">
              <p className="text-[var(--color-negative)]">
                This verifies access to a live account. It does not place orders or change the active trading mode.
              </p>
            </div>
          )}

          {connectBroker.isError && (
            <div className="glass-slab-floating relative overflow-hidden rounded-xl p-3 text-sm before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]">
              <p className="text-[var(--color-negative)]">
                {(connectBroker.error as Error)?.message || 'Connection failed. Check your credentials.'}
              </p>
            </div>
          )}

          <Button
            fullWidth
            type="submit"
            isLoading={connectBroker.isPending}
            disabled={!apiKey.trim() || !apiSecret.trim()}
            leftIcon={<Link2 className="w-4 h-4" />}
          >
            Verify credentials
          </Button>
        </div>

        {verificationMessage && <p role="status" className="workspace-notice">{verificationMessage}</p>}
      </form>
    </WorkspaceDialog>
  );
}
