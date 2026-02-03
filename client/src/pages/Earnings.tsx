import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, AlertCircle } from 'lucide-react';
import { portfolioApi } from '@/api/portfolio';
import { EarningsCalendar } from '@/components/earnings/EarningsCalendar';
import { EarningsForecast } from '@/components/earnings/EarningsForecast';
import { useUpcomingEarnings, useEarningsForecast, useRefreshForecast } from '@/hooks/useEarnings';

export function Earnings() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [daysAhead, setDaysAhead] = useState(30);

  // Get portfolio to extract symbols
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getPortfolio,
  });

  const symbols = useMemo(() => {
    return portfolio?.positions?.map(p => p.symbol) || [];
  }, [portfolio]);

  // Get upcoming earnings
  const {
    data: earnings = [],
    isLoading: earningsLoading,
  } = useUpcomingEarnings(symbols, daysAhead);

  // Get forecast for selected symbol
  const {
    data: forecast,
    isLoading: forecastLoading,
  } = useEarningsForecast(selectedSymbol);

  // Refresh forecast mutation
  const { mutate: refreshForecast, isPending: isRefreshing } = useRefreshForecast();

  const isLoading = portfolioLoading || earningsLoading;

  // Calculate stats
  const earningsThisWeek = earnings.filter(e => e.daysUntil <= 7).length;
  const earningsToday = earnings.filter(e => e.daysUntil === 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Earnings Calendar</h1>
          <p className="text-gray-500 mt-1">
            Track upcoming earnings and their expected impact on your portfolio
          </p>
        </div>
        <select
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
          className="px-4 py-2 border rounded-lg bg-white text-gray-700"
        >
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-500">Total Upcoming</p>
          <p className="text-2xl font-bold text-gray-900">{earnings.length}</p>
        </div>
        <div className={`p-4 rounded-lg border ${earningsToday > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <p className="text-sm text-gray-500">Reporting Today</p>
          <p className={`text-2xl font-bold ${earningsToday > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {earningsToday}
          </p>
        </div>
        <div className={`p-4 rounded-lg border ${earningsThisWeek > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white'}`}>
          <p className="text-sm text-gray-500">This Week</p>
          <p className={`text-2xl font-bold ${earningsThisWeek > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
            {earningsThisWeek}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-gray-500">Positions Tracked</p>
          <p className="text-2xl font-bold text-gray-900">{symbols.length}</p>
        </div>
      </div>

      {/* Alert for imminent earnings */}
      {earningsToday > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              {earningsToday} position{earningsToday > 1 ? 's' : ''} reporting today
            </p>
            <p className="text-sm text-red-600">
              Review forecasts and consider adjusting positions before market close
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && symbols.length === 0 && (
        <div className="bg-white p-12 rounded-lg border text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No positions to track</h3>
          <p className="text-gray-500">
            Add positions to your portfolio to see their upcoming earnings
          </p>
        </div>
      )}

      {/* Main Content - Calendar + Forecast */}
      {symbols.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EarningsCalendar
            earnings={earnings}
            isLoading={isLoading}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
          <EarningsForecast
            symbol={selectedSymbol}
            forecast={forecast}
            isLoading={forecastLoading}
            onRefresh={selectedSymbol ? () => refreshForecast(selectedSymbol) : undefined}
            isRefreshing={isRefreshing}
          />
        </div>
      )}

      {/* No upcoming earnings message */}
      {!isLoading && symbols.length > 0 && earnings.length === 0 && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-blue-800">
            None of your {symbols.length} positions have earnings scheduled in the next {daysAhead} days.
          </p>
        </div>
      )}
    </div>
  );
}
