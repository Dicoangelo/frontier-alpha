import { useState, useEffect, useMemo } from 'react';
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
  X,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { TradeExecutor } from '@/components/trading/TradeExecutor';
import { PriceChart } from '@/components/trading/PriceChart';
import {
  useTrading,
  useBrokerPositions,
  useMarketClock,
  useConnectBroker,
  useQuote,
} from '@/hooks/useTrading';

// ─── Sparkline mini-chart ────────────────────────────────────────────────────
function Sparkline({ symbol }: { symbol: string }) {
  const points = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i);
    const pts: number[] = [];
    for (let i = 0; i < 7; i++) {
      seed = (seed * 16807) % 2147483647;
      pts.push((seed % 100) / 100);
    }
    return pts;
  }, [symbol]);

  const width = 40;
  const height = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map(
      (p, i) =>
        `${(i / (points.length - 1)) * width},${height - ((p - min) / range) * height}`
    )
    .join(' ');
  const isUp = points[points.length - 1] > points[0];

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={coords}
        fill="none"
        stroke={isUp ? 'var(--color-positive)' : 'var(--color-negative)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Skeleton for Trading page ───────────────────────────────────────────────
function TradingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 py-8">
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
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);

  const {
    brokerConnected,
    brokerType,
    paperTrading,
    isLoading,
  } = useTrading();

  const { data: positionsData, isLoading: positionsLoading, refetch: refetchPositions } = useBrokerPositions();
  const { data: marketClock } = useMarketClock();
  const connectBroker = useConnectBroker();
  const { data: selectedQuote } = useQuote(selectedSymbol);

  const positions = positionsData?.positions || [];

  const handleConnectDemo = async () => {
    try {
      await connectBroker.mutateAsync({ broker: 'mock' });
    } catch (error) {
      console.error('Failed to connect demo broker:', error);
    }
  };

  if (isLoading) {
    return <TradingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Trade</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Execute orders and manage your positions
          </p>
        </div>

        {/* Connection Status Banner */}
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        >
          {!brokerConnected ? (
            <div
              className="mb-6 p-4 rounded-lg flex items-start gap-3 border"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderColor: 'rgba(245, 158, 11, 0.2)',
              }}
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-warning)]" />
              <div className="flex-1">
                <p className="font-medium text-[var(--color-warning)]">No Broker Connected</p>
                <p className="text-sm mt-1 text-[var(--color-warning)]" style={{ opacity: 0.8 }}>
                  Connect your Alpaca account to start trading, or use demo mode to practice.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowConnectionSettings(true)}
                    leftIcon={<Settings className="w-4 h-4" />}
                  >
                    Connect Broker
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleConnectDemo}
                    isLoading={connectBroker.isPending}
                  >
                    Use Demo Mode
                  </Button>
                </div>
              </div>
            </div>
          ) : paperTrading ? (
            <div
              className="mb-6 p-4 rounded-lg flex items-start gap-3 border"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.2)',
              }}
            >
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-info)]" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--color-info)]">Paper Trading Mode</p>
                  <Badge variant="info">
                    {brokerType === 'alpaca' ? 'Alpaca Paper' : 'Demo'}
                  </Badge>
                </div>
                <p className="text-sm mt-1 text-[var(--color-info)]" style={{ opacity: 0.8 }}>
                  All trades are simulated with virtual money. No real funds will be used.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowConnectionSettings(true)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div
              className="mb-6 p-4 rounded-lg flex items-start gap-3 border"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.2)',
              }}
            >
              <Shield className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-positive)]" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--color-positive)]">Live Trading</p>
                  <Badge variant="success">Alpaca Live</Badge>
                </div>
                <p className="text-sm mt-1 text-[var(--color-positive)]" style={{ opacity: 0.8 }}>
                  You are connected to live trading. Real funds will be used for trades.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowConnectionSettings(true)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

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
            <TradeExecutor
              defaultSymbol={selectedSymbol}
              onOrderSubmitted={(order) => {
                console.log('Order submitted:', order);
                refetchPositions();
              }}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Market Status */}
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-[var(--color-accent)]" />
                  <h3 className="font-semibold text-[var(--color-text)]">Market Status</h3>
                </div>
                <MarketStatusDisplay clock={marketClock} />
              </Card>
            </div>

            {/* Price Chart */}
            {selectedSymbol && (
              <div
                className="animate-fade-in-up"
                style={{ animationDelay: '220ms', animationFillMode: 'both' }}
              >
                <PriceChart
                  symbol={selectedSymbol}
                  currentPrice={selectedQuote?.last}
                />
              </div>
            )}

            {/* Positions */}
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '250ms', animationFillMode: 'both' }}
            >
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" />
                    <h3 className="font-semibold text-[var(--color-text)]">Positions</h3>
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
                  <div className="py-6 text-center text-[var(--color-text-muted)]">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                    <p className="text-sm">Loading positions...</p>
                  </div>
                ) : positions.length === 0 ? (
                  <div className="py-6 text-center text-[var(--color-text-muted)]">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
                    <p>No positions</p>
                    <p className="text-sm">Place trades to build your portfolio</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {positions.map((position) => (
                      <button
                        key={position.symbol}
                        onClick={() => setSelectedSymbol(position.symbol)}
                        className={`w-full p-3 rounded-lg border transition-all duration-200 text-left hover:shadow-lg active:scale-[0.98] ${
                          selectedSymbol === position.symbol
                            ? 'border-[var(--color-info)] animate-pulse-subtle'
                            : 'border-[var(--color-border-light)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                        }`}
                        style={
                          selectedSymbol === position.symbol
                            ? { backgroundColor: 'rgba(59, 130, 246, 0.1)' }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--color-text)]">
                                {position.symbol}
                              </span>
                              {position.side === 'long' ? (
                                <TrendingUp className="w-3 h-3 text-[var(--color-positive)]" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-[var(--color-negative)]" />
                              )}
                              <Sparkline symbol={position.symbol} />
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {position.qty} shares @ ${position.avgEntryPrice.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-[var(--color-text)]">
                              ${position.currentPrice.toFixed(2)}
                            </p>
                            <p
                              className="text-xs"
                              style={{
                                color:
                                  position.unrealizedPnL >= 0
                                    ? 'var(--color-positive)'
                                    : 'var(--color-negative)',
                              }}
                            >
                              {position.unrealizedPnL >= 0 ? '+' : ''}
                              ${position.unrealizedPnL.toFixed(2)} ({position.unrealizedPnLPercent.toFixed(2)}%)
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Trading Tips */}
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '300ms', animationFillMode: 'both' }}
            >
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
                  <h3 className="font-semibold text-[var(--color-text)]">Trading Tips</h3>
                </div>
                <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
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
              </Card>
            </div>
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
    return (
      <div className="space-y-2">
        <div className="skeleton-shimmer h-4 w-3/4 rounded" />
        <div className="skeleton-shimmer h-3 w-1/2 rounded" />
        <div className="skeleton-shimmer h-2 w-full rounded-full" />
      </div>
    );
  }

  const { label, isOpen, progressPercent } = getMarketPhase(now);
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
            className={`w-3 h-3 rounded-full flex-shrink-0 ${isOpen ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: isOpen ? 'var(--color-positive)' : 'var(--color-negative)' }}
          />
          <span className="font-medium text-[var(--color-text)]">
            Market {clock.isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
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
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressPercent}%`,
              background: `linear-gradient(to right, ${barColor}, color-mix(in srgb, ${barColor} 70%, var(--color-accent-secondary)))`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {label === 'Pre-Market' ? '4:00 AM' : label === 'Regular Hours' ? '9:30 AM' : label === 'After Hours' ? '4:00 PM' : '—'}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {label === 'Pre-Market' ? '9:30 AM' : label === 'Regular Hours' ? '4:00 PM' : label === 'After Hours' ? '8:00 PM' : '—'}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div
        className="flex items-center justify-between p-2 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        <span className="text-xs text-[var(--color-text-muted)]">
          {clock.isOpen ? 'Closes in' : 'Opens in'}
        </span>
        <span
          className="text-sm font-mono font-semibold tabular-nums"
          style={{ color: barColor }}
        >
          {countdown}
        </span>
      </div>

      {/* Next event time */}
      {nextEventDate && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          {clock.isOpen ? 'Closes' : 'Opens'}:{' '}
          {nextEventDate.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </p>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
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
  const [paperTrading, setPaperTrading] = useState(true);
  const connectBroker = useConnectBroker();

  const handleConnect = async () => {
    try {
      await connectBroker.mutateAsync({
        broker: 'alpaca',
        apiKey,
        apiSecret,
        paperTrading,
      });
      onClose();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleConnectDemo = async () => {
    try {
      await connectBroker.mutateAsync({ broker: 'mock' });
      onClose();
    } catch (error) {
      console.error('Demo connection failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <Card className="w-full max-w-lg p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Broker Connection</h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--color-bg-secondary)] rounded transition-colors"
          >
            <X className="w-5 h-5 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Current Status */}
        <div className="mb-6 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {isConnected ? (
              <Link2 className="w-5 h-5 text-[var(--color-positive)]" />
            ) : (
              <Unlink className="w-5 h-5 text-[var(--color-text-muted)]" />
            )}
            <span className="font-medium text-[var(--color-text)]">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          {isConnected && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Broker: <span className="font-medium capitalize">{currentBroker}</span>
              {isPaperTrading && <Badge variant="info" className="ml-2">Paper</Badge>}
            </p>
          )}
        </div>

        {/* Alpaca Connection Form */}
        <div className="space-y-4 mb-6">
          <h3 className="font-medium text-[var(--color-text)]">Connect Alpaca Account</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Get your API keys from{' '}
            <a
              href="https://app.alpaca.markets/paper/dashboard/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-info)] hover:underline"
            >
              Alpaca Dashboard
            </a>
          </p>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="PK..."
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              API Secret
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Your secret key"
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)]"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={paperTrading}
              onChange={(e) => setPaperTrading(e.target.checked)}
              className="w-5 h-5 rounded border-[var(--color-border)] accent-[var(--color-info)]"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">Paper trading (recommended)</span>
          </label>

          {!paperTrading && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-negative)',
              }}
            >
              <strong>Warning:</strong> Live trading uses real money. Only disable paper trading if you understand the risks.
            </div>
          )}

          {connectBroker.isError && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-negative)',
              }}
            >
              {(connectBroker.error as Error)?.message || 'Connection failed. Check your credentials.'}
            </div>
          )}

          <Button
            fullWidth
            onClick={handleConnect}
            isLoading={connectBroker.isPending}
            disabled={!apiKey || !apiSecret}
            leftIcon={<Link2 className="w-4 h-4" />}
          >
            Connect Alpaca
          </Button>
        </div>

        <hr className="my-6 border-[var(--color-border)]" />

        {/* Demo Mode */}
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            Or try the platform without a broker account
          </p>
          <Button
            variant="outline"
            onClick={handleConnectDemo}
            isLoading={connectBroker.isPending}
          >
            Use Demo Mode
          </Button>
        </div>
      </Card>
    </div>
  );
}
