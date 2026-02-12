import { useState } from 'react';
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
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { TradeExecutor } from '@/components/trading/TradeExecutor';
import {
  useTrading,
  useBrokerPositions,
  useMarketClock,
  useConnectBroker,
} from '@/hooks/useTrading';

export default function Trading() {
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);

  const {
    brokerConnected,
    brokerType,
    paperTrading,
  } = useTrading();

  const { data: positionsData, isLoading: positionsLoading, refetch: refetchPositions } = useBrokerPositions();
  const { data: marketClock } = useMarketClock();
  const connectBroker = useConnectBroker();

  const positions = positionsData?.positions || [];

  // Handle broker connection
  const handleConnectDemo = async () => {
    try {
      await connectBroker.mutateAsync({ broker: 'mock' });
    } catch (error) {
      console.error('Failed to connect demo broker:', error);
    }
  };

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
        {!brokerConnected ? (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-500">No Broker Connected</p>
              <p className="text-sm text-amber-600 mt-1">
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
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-blue-400">Paper Trading Mode</p>
                <Badge variant="info">
                  {brokerType === 'alpaca' ? 'Alpaca Paper' : 'Demo'}
                </Badge>
              </div>
              <p className="text-sm text-blue-600 mt-1">
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
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-green-400">Live Trading</p>
                <Badge variant="success">Alpaca Live</Badge>
              </div>
              <p className="text-sm text-green-600 mt-1">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trade Executor - Main Column */}
          <div className="lg:col-span-2">
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
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-[var(--color-text)]">Market Status</h3>
              </div>
              <MarketStatusDisplay clock={marketClock} />
            </Card>

            {/* Quick Trade Positions */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
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
                      className={`w-full p-3 rounded-lg border transition-all text-left ${
                        selectedSymbol === position.symbol
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-[var(--color-border-light)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--color-text)]">
                              {position.symbol}
                            </span>
                            {position.side === 'long' ? (
                              <TrendingUp className="w-3 h-3 text-green-500" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-red-500" />
                            )}
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
                            className={`text-xs ${
                              position.unrealizedPnL >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
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

            {/* Trading Tips */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-[var(--color-text)]">Trading Tips</h3>
              </div>
              <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">*</span>
                  Use limit orders for better price control
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">*</span>
                  Preview orders before submission to check estimated costs
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">*</span>
                  Check factor exposures before large trades
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">*</span>
                  Consider earnings dates for volatile stocks
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">*</span>
                  Review optimization suggestions regularly
                </li>
              </ul>
            </Card>
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

// Market status display component
function MarketStatusDisplay({ clock }: { clock?: { isOpen: boolean; nextOpen: string; nextClose: string } }) {
  if (!clock) {
    return <p className="text-[var(--color-text-muted)] text-sm">Loading market status...</p>;
  }

  const nextOpen = clock.nextOpen ? new Date(clock.nextOpen) : null;
  const nextClose = clock.nextClose ? new Date(clock.nextClose) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            clock.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <span className="font-medium text-[var(--color-text)]">
          Market {clock.isOpen ? 'Open' : 'Closed'}
        </span>
      </div>

      {!clock.isOpen && nextOpen && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Opens: {nextOpen.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </p>
      )}

      {clock.isOpen && nextClose && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Closes: {nextClose.toLocaleString('en-US', {
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

// Connection settings modal
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Broker Connection</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--color-bg-secondary)] rounded">
            <span className="text-2xl text-[var(--color-text-muted)]">&times;</span>
          </button>
        </div>

        {/* Current Status */}
        <div className="mb-6 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {isConnected ? (
              <Link2 className="w-5 h-5 text-green-600" />
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
              className="text-blue-600 hover:underline"
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
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500"
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
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={paperTrading}
              onChange={(e) => setPaperTrading(e.target.checked)}
              className="w-5 h-5 rounded border-[var(--color-border)] text-blue-600"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">Paper trading (recommended)</span>
          </label>

          {!paperTrading && (
            <div className="p-3 bg-red-500/10 rounded-lg text-sm text-red-400">
              <strong>Warning:</strong> Live trading uses real money. Only disable paper trading if you understand the risks.
            </div>
          )}

          {connectBroker.isError && (
            <div className="p-3 bg-red-500/10 rounded-lg text-sm text-red-400">
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

        <hr className="my-6" />

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
