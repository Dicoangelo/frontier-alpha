import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles, TrendingUp, Shield, Target, Info } from 'lucide-react';
import { api, getErrorMessage } from '@/api/client';
import { useToast } from '@/hooks/useToast';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';

type OptimizationObjective = 'max_sharpe' | 'min_volatility' | 'risk_parity' | 'target_volatility';

interface OptimizationConfig {
  objective: OptimizationObjective;
  constraints?: {
    minWeight?: number;
    maxWeight?: number;
    targetVolatility?: number;
  };
}

interface MonteCarloResult {
  medianReturn: number;
  var95: number;
  cvar95: number;
  probPositive: number;
  confidenceInterval: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  simulations?: number[];
}

interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: Array<{
    factor: string;
    exposure: number;
    contribution: number;
  }>;
  monteCarlo?: MonteCarloResult;
}

const objectives: { value: OptimizationObjective; label: string; description: string; icon: typeof TrendingUp }[] = [
  { value: 'max_sharpe', label: 'Maximum Sharpe', description: 'Maximize risk-adjusted returns', icon: TrendingUp },
  { value: 'min_volatility', label: 'Minimum Volatility', description: 'Minimize portfolio risk', icon: Shield },
  { value: 'risk_parity', label: 'Risk Parity', description: 'Equal risk contribution', icon: Target },
  { value: 'target_volatility', label: 'Target Volatility', description: 'Hit a specific volatility level', icon: Info },
];

export function Optimize() {
  const [selectedObjective, setSelectedObjective] = useState<OptimizationObjective>('max_sharpe');
  const [targetVol, setTargetVol] = useState('0.15');
  const [maxWeight, setMaxWeight] = useState('0.25');
  const { toastSuccess, toastError } = useToast();

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.get('/portfolio'),
  });

  const optimizeMutation = useMutation<{ data: OptimizationResult }, Error, { symbols: string[]; config: OptimizationConfig }>({
    mutationFn: (data) => api.post('/portfolio/optimize', data),
    onSuccess: (response) => {
      const sharpe = response.data.sharpeRatio.toFixed(2);
      toastSuccess('Optimization complete', { message: `Sharpe ratio: ${sharpe}` });
    },
    onError: (error) => {
      toastError('Optimization failed', { message: getErrorMessage(error) });
    },
  });

  const symbols = portfolio?.data?.positions?.map((p: { symbol: string }) => p.symbol) || [];

  const handleOptimize = () => {
    if (symbols.length === 0) return;

    const config: OptimizationConfig = {
      objective: selectedObjective,
      constraints: {
        maxWeight: parseFloat(maxWeight),
      },
    };

    if (selectedObjective === 'target_volatility') {
      config.constraints!.targetVolatility = parseFloat(targetVol);
    }

    optimizeMutation.mutate({ symbols, config });
  };

  const result = optimizeMutation.data?.data;

  return (
    <div className="space-y-6">
      {/* OPT2-002: Header — 0ms */}
      <div className="flex items-center justify-between animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Portfolio Optimization</h1>
          <p className="text-[var(--color-text-muted)] mt-1">Multi-factor optimization with cognitive insights</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OPT2-002: Left column — 50ms */}
        <div className="lg:col-span-2 space-y-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Optimization Objective</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {objectives.map((obj) => (
                <button
                  key={obj.value}
                  onClick={() => setSelectedObjective(obj.value)}
                  className={`p-4 min-h-[44px] rounded-lg border-2 text-left transition hover:shadow-md transition-all duration-200 ${
                    selectedObjective === obj.value
                      ? ''
                      : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                  }`}
                  /* OPT2-001: accent border/bg for selected state */
                  style={
                    selectedObjective === obj.value
                      ? { borderColor: 'var(--color-accent)', backgroundColor: 'rgba(123, 44, 255, 0.1)' }
                      : undefined
                  }
                >
                  {/* OPT2-001: icon color */}
                  <obj.icon
                    className="w-5 h-5 mb-2"
                    style={{ color: selectedObjective === obj.value ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                  />
                  <p className="font-medium text-[var(--color-text)]">{obj.label}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">{obj.description}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Constraints</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Max Position Weight
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  max="1"
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value)}
                  className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Max {(parseFloat(maxWeight) * 100).toFixed(0)}% in any position</p>
              </div>
              {selectedObjective === 'target_volatility' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                    Target Volatility
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.05"
                    max="0.5"
                    value={targetVol}
                    onChange={(e) => setTargetVol(e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg"
                  />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Target {(parseFloat(targetVol) * 100).toFixed(0)}% annualized</p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <Button
                onClick={handleOptimize}
                disabled={symbols.length === 0 || optimizeMutation.isPending}
                className="w-full"
              >
                {optimizeMutation.isPending ? (
                  <Spinner className="w-5 h-5" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Run Optimization
                  </>
                )}
              </Button>
              {symbols.length === 0 && (
                /* OPT2-001: warning color */
                <p className="text-sm text-[var(--color-warning)] mt-2">
                  Add positions to your portfolio first
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* OPT2-002: Right column (Holdings) — 100ms */}
        <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Current Holdings</h2>
            {symbols.length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-sm">No positions in portfolio</p>
            ) : (
              <div className="space-y-2">
                {symbols.map((symbol: string) => (
                  <div key={symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="font-medium">{symbol}</span>
                    {result?.weights?.[symbol] !== undefined && (
                      /* OPT2-001: accent color for result weight */
                      <span className="text-[var(--color-accent)] font-medium">
                        {(result.weights[symbol] * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {result && (
        /* OPT2-002: Results section — 150ms */
        <Card className="p-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <h2 className="text-lg font-semibold mb-4">Optimization Results</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
              <p className="text-sm text-[var(--color-text-muted)]">Expected Return</p>
              {/* OPT2-001: positive color */}
              <p className="text-xl font-bold text-[var(--color-positive)]">
                {(result.expectedReturn * 100).toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
              <p className="text-sm text-[var(--color-text-muted)]">Expected Volatility</p>
              {/* OPT2-001: warning color */}
              <p className="text-xl font-bold text-[var(--color-warning)]">
                {(result.expectedVolatility * 100).toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
              <p className="text-sm text-[var(--color-text-muted)]">Sharpe Ratio</p>
              {/* OPT2-001: accent color */}
              <p className="text-xl font-bold text-[var(--color-accent)]">
                {result.sharpeRatio.toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
              <p className="text-sm text-[var(--color-text-muted)]">Positions</p>
              <p className="text-xl font-bold text-[var(--color-text)]">
                {Object.keys(result.weights).length}
              </p>
            </div>
          </div>

          <h3 className="font-medium text-[var(--color-text-secondary)] mb-3">Optimal Weights</h3>
          <div className="space-y-2">
            {Object.entries(result.weights)
              .sort(([, a], [, b]) => b - a)
              .map(([symbol, weight]) => (
                /* OPT2-003: weight bar row hover polish */
                <div key={symbol} className="flex items-center gap-3 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors duration-150 px-1">
                  <span className="w-16 font-medium">{symbol}</span>
                  <div className="flex-1 h-6 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      /* OPT2-001: gradient via inline style */
                      style={{
                        width: `${weight * 100}%`,
                        background: 'linear-gradient(to right, var(--color-accent), #a855f7)',
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-[var(--color-text-secondary)]">
                    {(weight * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* OPT2-002: Monte Carlo — 200ms */}
      {result && (
        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <MonteCarloChart
            result={result.monteCarlo || {
              // Generate Monte Carlo estimate from optimization result if not provided by API
              medianReturn: result.expectedReturn,
              var95: -result.expectedVolatility * 1.645,
              cvar95: -result.expectedVolatility * 2.063,
              probPositive: 0.5 + (result.expectedReturn / (result.expectedVolatility * 2)) * 0.3,
              confidenceInterval: {
                p5: result.expectedReturn - result.expectedVolatility * 1.645,
                p25: result.expectedReturn - result.expectedVolatility * 0.675,
                p50: result.expectedReturn,
                p75: result.expectedReturn + result.expectedVolatility * 0.675,
                p95: result.expectedReturn + result.expectedVolatility * 1.645,
              },
            }}
            timeHorizon="1 Year"
          />
        </div>
      )}
    </div>
  );
}
