import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Activity,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { TradeExecutor } from '@/components/trading/TradeExecutor';
import { api } from '@/api/client';

interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  currentPrice: number;
}

export default function Trading() {
  const [selectedSymbol, setSelectedSymbol] = useState('');

  // Fetch portfolio positions for quick trading
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio-positions'],
    queryFn: () => api.get('/portfolio'),
    staleTime: 30 * 1000,
  });

  const positions: Position[] = portfolioData?.data?.positions || [];

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

        {/* Paper Trading Notice */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Paper Trading Mode</p>
            <p className="text-sm text-blue-700 mt-1">
              All trades are simulated. Configure your Alpaca API keys in environment variables to enable real paper or live trading.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trade Executor - Main Column */}
          <div className="lg:col-span-2">
            <TradeExecutor
              defaultSymbol={selectedSymbol}
              onOrderSubmitted={(order) => {
                console.log('Order submitted:', order);
              }}
            />
          </div>

          {/* Sidebar - Positions for Quick Trading */}
          <div className="space-y-6">
            {/* Quick Trade Positions */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Positions</h3>
              </div>

              {positions.length === 0 ? (
                <div className="py-6 text-center text-gray-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No positions</p>
                  <p className="text-sm">Add positions to trade</p>
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
                          <span className="font-semibold text-gray-900">
                            {position.symbol}
                          </span>
                          <p className="text-xs text-gray-500">
                            {position.qty} shares
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
                            {position.unrealizedPnLPercent.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Market Status */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">Market Status</h3>
              </div>
              <MarketStatus />
            </Card>

            {/* Trading Tips */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-gray-900">Trading Tips</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Use limit orders for better price control
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Check factor exposures before large trades
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Consider earnings dates for volatile stocks
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  Review optimization suggestions regularly
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Market status component
function MarketStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['market-status'],
    queryFn: async () => {
      // Simple market hours check
      const now = new Date();
      const hour = now.getUTCHours();
      const day = now.getUTCDay();

      // US Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
      const isWeekday = day >= 1 && day <= 5;
      const isDuringHours = hour >= 14 && hour < 21;
      const isOpen = isWeekday && isDuringHours;

      return {
        isOpen,
        nextOpen: isOpen ? null : getNextOpen(now),
        nextClose: isOpen ? getNextClose(now) : null,
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return <p className="text-gray-500">Checking market status...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            data?.isOpen ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="font-medium text-gray-900">
          Market {data?.isOpen ? 'Open' : 'Closed'}
        </span>
      </div>
      {data?.nextOpen && (
        <p className="text-sm text-gray-600">
          Opens: {data.nextOpen.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </p>
      )}
      {data?.nextClose && (
        <p className="text-sm text-gray-600">
          Closes: {data.nextClose.toLocaleString('en-US', {
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

function getNextOpen(now: Date): Date {
  const next = new Date(now);
  // Set to next market open (9:30 AM ET = 14:30 UTC)
  next.setUTCHours(14, 30, 0, 0);

  // If we're past today's open, go to next day
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  // Skip weekends
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function getNextClose(now: Date): Date {
  const next = new Date(now);
  // Set to market close (4:00 PM ET = 21:00 UTC)
  next.setUTCHours(21, 0, 0, 0);
  return next;
}
