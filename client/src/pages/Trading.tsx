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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Trade</h1>
          <p className="text-gray-600 mt-1">
            Execute orders and manage your positions
          </p>
        </div>

        {/* Connection Status Banner */}
        {!brokerConnected ? (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">No Broker Connected</p>
              <p className="text-sm text-amber-700 mt-1">
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
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-blue-900">Paper Trading Mode</p>
                <Badge variant="info">
                  {brokerType === 'alpaca' ? 'Alpaca Paper' : 'Demo'}
                </Badge>
              </div>
              <p className="text-sm text-blue-700 mt-1">
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
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-green-900">Live Trading</p>
                <Badge variant="success">Alpaca Live</Badge>
              </div>
              <p className="text-sm text-green-700 mt-1">
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
                <h3 className="font-semibold text-gray-900">Market Status</h3>
              </div>
              <MarketStatusDisplay clock={marketClock} />
            </Card>

            {/* Quick Trade Positions */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-900">Positions</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchPositions()}
                  disabled={positionsLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${positionsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {positionsLoading ? (
                <div className="py-6 text-center text-gray-500">
                  <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Loading positions...</p>
                </div>
              ) : positions.length === 0 ? (
                <div className="py-6 text-center text-gray-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
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
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              {position.symbol}
                            </span>
                            {position.side === 'long' ? (
                              <TrendingUp className="w-3 h-3 text-green-500" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {position.qty} shares @ ${position.avgEntryPrice.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
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
                <h3 className="font-semibold text-gray-900">Trading Tips</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
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
    return <p className="text-gray-500 text-sm">Loading market status...</p>;
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
        <span className="font-medium text-gray-900">
          Market {clock.isOpen ? 'Open' : 'Closed'}
        </span>
      </div>

      {!clock.isOpen && nextOpen && (
        <p className="text-sm text-gray-600">
          Opens: {nextOpen.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </p>
      )}

      {clock.isOpen && nextClose && (
        <p className="text-sm text-gray-600">
          Closes: {nextClose.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </p>
      )}

      <p className="text-xs text-gray-500">
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
          <h2 className="text-xl font-semibold text-gray-900">Broker Connection</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <span className="text-2xl text-gray-400">&times;</span>
          </button>
        </div>

        {/* Current Status */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            {isConnected ? (
              <Link2 className="w-5 h-5 text-green-600" />
            ) : (
              <Unlink className="w-5 h-5 text-gray-400" />
            )}
            <span className="font-medium text-gray-900">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          {isConnected && (
            <p className="text-sm text-gray-600">
              Broker: <span className="font-medium capitalize">{currentBroker}</span>
              {isPaperTrading && <Badge variant="info" className="ml-2">Paper</Badge>}
            </p>
          )}
        </div>

        {/* Alpaca Connection Form */}
        <div className="space-y-4 mb-6">
          <h3 className="font-medium text-gray-900">Connect Alpaca Account</h3>
          <p className="text-sm text-gray-600">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="PK..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Secret
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Your secret key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={paperTrading}
              onChange={(e) => setPaperTrading(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Paper trading (recommended)</span>
          </label>

          {!paperTrading && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
              <strong>Warning:</strong> Live trading uses real money. Only disable paper trading if you understand the risks.
            </div>
          )}

          {connectBroker.isError && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
              {(connectBroker.error as any)?.response?.data?.error || 'Connection failed. Check your credentials.'}
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
          <p className="text-sm text-gray-600 mb-3">
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
