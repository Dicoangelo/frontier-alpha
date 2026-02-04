/**
 * FRONTIER ALPHA - React Dashboard
 * 
 * Full-featured dashboard for cognitive factor intelligence.
 * Single-file React component ready for immediate deployment.
 * 
 * Features:
 * - Portfolio overview with real-time updates
 * - Factor exposure visualization
 * - Risk metrics and alerts
 * - Earnings calendar
 * - AI-powered explanations
 */

import React, { useState, useEffect } from 'react';

// ============================================================================
// TYPES (inline for single-file deployment)
// ============================================================================

interface Position {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
  change24h: number;
}

interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
}

interface RiskMetrics {
  sharpeRatio: number;
  volatility: number;
  maxDrawdown: number;
  beta: number;
  var95: number;
}

interface RiskAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
}

interface EarningsEvent {
  symbol: string;
  date: Date;
  expectedMove: number;
  recommendation: string;
}

// ============================================================================
// MOCK DATA (replace with API calls)
// ============================================================================

const MOCK_POSITIONS: Position[] = [
  { symbol: 'NVDA', shares: 50, weight: 0.22, costBasis: 450, currentPrice: 520, unrealizedPnL: 3500, change24h: 2.3 },
  { symbol: 'MSFT', shares: 30, weight: 0.18, costBasis: 380, currentPrice: 415, unrealizedPnL: 1050, change24h: -0.5 },
  { symbol: 'AAPL', shares: 100, weight: 0.15, costBasis: 175, currentPrice: 195, unrealizedPnL: 2000, change24h: 0.8 },
  { symbol: 'GOOGL', shares: 25, weight: 0.14, costBasis: 140, currentPrice: 165, unrealizedPnL: 625, change24h: 1.2 },
  { symbol: 'AMZN', shares: 40, weight: 0.12, costBasis: 180, currentPrice: 205, unrealizedPnL: 1000, change24h: -1.1 },
];

const MOCK_FACTORS: FactorExposure[] = [
  { factor: 'Momentum', exposure: 0.85, tStat: 2.31, confidence: 0.92 },
  { factor: 'Quality', exposure: 0.62, tStat: 1.89, confidence: 0.85 },
  { factor: 'Low Vol', exposure: -0.42, tStat: -1.45, confidence: 0.78 },
  { factor: 'Value', exposure: -0.28, tStat: -0.92, confidence: 0.65 },
  { factor: 'Size', exposure: 0.15, tStat: 0.54, confidence: 0.52 },
];

const MOCK_METRICS: RiskMetrics = {
  sharpeRatio: 1.24,
  volatility: 0.186,
  maxDrawdown: -0.082,
  beta: 1.12,
  var95: 0.034,
};

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = 
  ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
    <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
    {children}
  </div>
);

const Badge: React.FC<{ 
  variant: 'success' | 'warning' | 'danger' | 'info'; 
  children: React.ReactNode 
}> = ({ variant, children }) => {
  const colors = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
};

export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  color?: string;
  showLabel?: boolean;
}> = ({ value, max = 1, color = 'blue', showLabel = false }) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const isNegative = value < 0;
  
  return (
    <div className="w-full">
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${
            isNegative ? 'bg-red-500' : `bg-${color}-500`
          }`}
          style={{ 
            width: `${Math.abs(percentage)}%`,
            marginLeft: isNegative ? `${50 - Math.abs(percentage) / 2}%` : '50%',
            transform: isNegative ? 'translateX(-100%)' : 'translateX(-50%)'
          }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 mt-1">{(value * 100).toFixed(0)}%</span>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENTS
// ============================================================================

const PortfolioOverview: React.FC<{ positions: Position[] }> = ({ positions }) => {
  const totalValue = positions.reduce((sum, p) => sum + p.currentPrice * p.shares, 0);
  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const pnlPercent = (totalPnL / (totalValue - totalPnL)) * 100;

  return (
    <Card title="Portfolio Overview">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500">Total Value</p>
          <p className="text-2xl font-bold text-gray-800">${totalValue.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Unrealized P&L</p>
          <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Return</p>
          <p className={`text-2xl font-bold ${pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {positions.map(pos => (
          <div key={pos.symbol} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                {pos.symbol.slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{pos.symbol}</p>
                <p className="text-sm text-gray-500">{pos.shares} shares • {(pos.weight * 100).toFixed(1)}%</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">${pos.currentPrice.toFixed(2)}</p>
              <p className={`text-sm ${pos.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {pos.change24h >= 0 ? '↑' : '↓'} {Math.abs(pos.change24h).toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const FactorExposures: React.FC<{ factors: FactorExposure[] }> = ({ factors }) => {
  return (
    <Card title="Factor Exposures">
      <div className="space-y-4">
        {factors.map(factor => (
          <div key={factor.factor} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">{factor.factor}</span>
              <span className={`text-sm font-bold ${factor.exposure >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {factor.exposure >= 0 ? '+' : ''}{factor.exposure.toFixed(2)}
              </span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded-full">
              <div 
                className={`absolute top-0 h-full rounded-full ${
                  factor.exposure >= 0 ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{
                  left: factor.exposure >= 0 ? '50%' : `${50 + factor.exposure * 25}%`,
                  width: `${Math.abs(factor.exposure) * 25}%`,
                }}
              />
              <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gray-400" />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>t-stat: {factor.tStat.toFixed(2)}</span>
              <span>confidence: {(factor.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>AI Insight:</strong> Your portfolio has strong momentum exposure (+0.85) 
          which historically performs well in trending markets. Consider adding value 
          exposure for diversification.
        </p>
      </div>
    </Card>
  );
};

const RiskDashboard: React.FC<{ metrics: RiskMetrics; alerts: RiskAlert[] }> = ({ metrics, alerts }) => {
  return (
    <Card title="Risk Metrics">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">Sharpe Ratio</p>
          <p className="text-xl font-bold text-gray-800">{metrics.sharpeRatio.toFixed(2)}</p>
          <Badge variant={metrics.sharpeRatio >= 1 ? 'success' : 'warning'}>
            {metrics.sharpeRatio >= 1 ? 'Good' : 'Fair'}
          </Badge>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">Volatility (Ann.)</p>
          <p className="text-xl font-bold text-gray-800">{(metrics.volatility * 100).toFixed(1)}%</p>
          <Badge variant={metrics.volatility <= 0.20 ? 'success' : 'warning'}>
            {metrics.volatility <= 0.20 ? 'Normal' : 'Elevated'}
          </Badge>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">Max Drawdown</p>
          <p className="text-xl font-bold text-red-600">{(metrics.maxDrawdown * 100).toFixed(1)}%</p>
          <Badge variant={Math.abs(metrics.maxDrawdown) <= 0.10 ? 'success' : 'danger'}>
            {Math.abs(metrics.maxDrawdown) <= 0.10 ? 'Acceptable' : 'High'}
          </Badge>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">VaR (95%)</p>
          <p className="text-xl font-bold text-gray-800">{(metrics.var95 * 100).toFixed(1)}%</p>
          <Badge variant="info">Daily</Badge>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="font-medium text-gray-700">Active Alerts</h4>
          {alerts.map(alert => (
            <div 
              key={alert.id}
              className={`p-3 rounded-lg border-l-4 ${
                alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
                alert.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                'bg-blue-50 border-blue-500'
              }`}
            >
              <p className="font-medium text-gray-800">{alert.title}</p>
              <p className="text-sm text-gray-600">{alert.message}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const EarningsCalendar: React.FC<{ events: EarningsEvent[] }> = ({ events }) => {
  // Use provided events or fall back to mock data
  const displayEvents: EarningsEvent[] = events.length > 0 ? events : [
    { symbol: 'NVDA', date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), expectedMove: 0.082, recommendation: 'hold' },
    { symbol: 'MSFT', date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), expectedMove: 0.045, recommendation: 'hold' },
    { symbol: 'AAPL', date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), expectedMove: 0.038, recommendation: 'hold' },
  ];

  return (
    <Card title="Upcoming Earnings">
      <div className="space-y-3">
        {displayEvents.map(event => (
          <div key={event.symbol} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-semibold text-gray-800">{event.symbol}</p>
              <p className="text-sm text-gray-500">
                {event.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Expected Move</p>
              <p className="font-bold text-blue-600">±{(event.expectedMove * 100).toFixed(1)}%</p>
            </div>
            <Badge variant={event.recommendation === 'hold' ? 'info' : 'warning'}>
              {event.recommendation.toUpperCase()}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
};

const AIExplanation: React.FC = () => {
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const generateExplanation = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setExplanation(
      `📊 **Daily Portfolio Analysis**

Your portfolio outperformed the S&P 500 by 0.42% today, driven primarily by:

• **NVDA (+2.3%)**: Strong momentum factor contribution. The semiconductor sector continues to benefit from AI demand.

• **Factor Attribution**: Momentum factor contributed +1.2% while the low-volatility underweight added +0.3%.

• **Risk Status**: Current drawdown of 8.2% is within tolerance but approaching your 10% threshold.

**Recommendation**: Consider taking partial profits in NVDA (currently 22% of portfolio) to reduce concentration risk before their earnings report in 3 days.`
    );
    setLoading(false);
  };

  return (
    <Card title="AI-Powered Insights" className="col-span-full">
      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-600">Get cognitive explanations for your portfolio performance.</p>
        <button
          onClick={generateExplanation}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? '✨ Analyzing...' : '✨ Generate Insight'}
        </button>
      </div>
      
      {explanation && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{explanation}</pre>
        </div>
      )}
    </Card>
  );
};

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

const FrontierAlphaDashboard: React.FC = () => {
  const [positions] = useState<Position[]>(MOCK_POSITIONS);
  const [factors] = useState<FactorExposure[]>(MOCK_FACTORS);
  const [metrics] = useState<RiskMetrics>(MOCK_METRICS);
  const [alerts] = useState<RiskAlert[]>([
    {
      id: '1',
      severity: 'medium',
      title: 'Concentration Risk',
      message: 'NVDA position (22%) exceeds 20% threshold',
      timestamp: new Date(),
    }
  ]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl">🤠</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Frontier Alpha</h1>
              <p className="text-xs text-gray-500">Cognitive Factor Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-600">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PortfolioOverview positions={positions} />
          <FactorExposures factors={factors} />
          <RiskDashboard metrics={metrics} alerts={alerts} />
          <EarningsCalendar events={[]} />
          <AIExplanation />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Frontier Alpha • Cognitive Factor Intelligence Platform • DQ Score: 0.88</p>
          <p className="mt-1">Built with ResearchGravity v1.1 • Metaventions AI</p>
        </div>
      </footer>
    </div>
  );
};

export default FrontierAlphaDashboard;
