import { useEffect } from 'react';
import { wsClient } from '@/api/websocket';
import { useQuotesStore } from '@/stores/quotesStore';
import { PortfolioOverview } from '@/components/portfolio/PortfolioOverview';
import { PositionList } from '@/components/portfolio/PositionList';
import { FactorExposures } from '@/components/factors/FactorExposures';
import { RiskMetrics } from '@/components/risk/RiskMetrics';
import { CognitiveInsight } from '@/components/explainer/CognitiveInsight';

// Mock data for demo
const MOCK_PORTFOLIO = {
  id: '1',
  name: 'Main Portfolio',
  positions: [
    { symbol: 'NVDA', shares: 50, weight: 0.22, costBasis: 450, currentPrice: 520, unrealizedPnL: 3500 },
    { symbol: 'MSFT', shares: 30, weight: 0.18, costBasis: 380, currentPrice: 415, unrealizedPnL: 1050 },
    { symbol: 'AAPL', shares: 100, weight: 0.15, costBasis: 175, currentPrice: 195, unrealizedPnL: 2000 },
    { symbol: 'GOOGL', shares: 25, weight: 0.14, costBasis: 140, currentPrice: 165, unrealizedPnL: 625 },
    { symbol: 'AMZN', shares: 40, weight: 0.12, costBasis: 180, currentPrice: 205, unrealizedPnL: 1000 },
  ],
  cash: 15000,
  totalValue: 125000,
  currency: 'USD',
};

const MOCK_FACTORS = [
  { factor: 'momentum_12m', exposure: 0.85, tStat: 2.31, confidence: 0.92, contribution: 0.04 },
  { factor: 'quality', exposure: 0.62, tStat: 1.89, confidence: 0.85, contribution: 0.02 },
  { factor: 'low_vol', exposure: -0.42, tStat: -1.45, confidence: 0.78, contribution: 0.01 },
  { factor: 'value', exposure: -0.28, tStat: -0.92, confidence: 0.65, contribution: -0.01 },
  { factor: 'size', exposure: 0.15, tStat: 0.54, confidence: 0.52, contribution: 0.005 },
];

const MOCK_METRICS = {
  sharpeRatio: 1.24,
  volatility: 0.186,
  maxDrawdown: -0.082,
  beta: 1.12,
  var95: 0.034,
  cvar95: 0.051,
};

export function Dashboard() {
  const quotes = useQuotesStore((state) => state.quotes);
  const updateQuote = useQuotesStore((state) => state.updateQuote);

  // Connect WebSocket and subscribe to quotes
  useEffect(() => {
    wsClient.connect();

    const symbols = MOCK_PORTFOLIO.positions.map((p) => p.symbol);
    wsClient.subscribe(symbols);

    const unsubscribe = wsClient.on('quote', (quote) => {
      updateQuote(quote);
    });

    return () => {
      unsubscribe();
      wsClient.disconnect();
    };
  }, [updateQuote]);

  const portfolio = MOCK_PORTFOLIO;
  const factors = MOCK_FACTORS;
  const metrics = MOCK_METRICS;

  return (
    <div className="space-y-6">
      <PortfolioOverview portfolio={portfolio} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionList positions={portfolio.positions} quotes={quotes} />
        <FactorExposures
          factors={factors}
          insight="Strong momentum exposure (+0.85) performs well in trending markets. Consider adding value exposure for diversification."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskMetrics metrics={metrics} />
        <CognitiveInsight symbols={portfolio.positions.map((p) => p.symbol)} />
      </div>
    </div>
  );
}
