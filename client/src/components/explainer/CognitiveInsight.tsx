import React, { useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, TrendingUp, TrendingDown, Shield, Zap, RefreshCw } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { api } from '@/api/client';
import type { FactorExposure } from '@/types';

interface InsightSection {
  type: 'risk' | 'opportunity' | 'action' | 'factor';
  icon: React.ReactNode;
  title: string;
  content: string;
  confidence?: number;
}

interface CognitiveInsightProps {
  symbols: string[];
  factors?: FactorExposure[];
}

// Generate insights from portfolio factors
function generateInsights(symbols: string[], factors: FactorExposure[]): InsightSection[] {
  const insights: InsightSection[] = [];

  if (factors.length === 0) {
    return [{
      type: 'action',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Getting Started',
      content: 'Add positions to your portfolio to receive AI-powered insights and factor analysis.',
    }];
  }

  // Analyze momentum exposure
  const momentumFactor = factors.find(f => f.factor.includes('momentum'));
  if (momentumFactor) {
    if (momentumFactor.exposure > 0.5) {
      insights.push({
        type: 'opportunity',
        icon: <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" />,
        title: 'Strong Momentum',
        content: `Your portfolio has high momentum exposure (${momentumFactor.exposure.toFixed(2)}). This tends to perform well in trending markets but may underperform during market reversals. Consider maintaining trailing stops on high-momentum positions.`,
        confidence: momentumFactor.confidence,
      });
    } else if (momentumFactor.exposure < -0.3) {
      insights.push({
        type: 'risk',
        icon: <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" />,
        title: 'Contrarian Positioning',
        content: `Your portfolio shows negative momentum exposure (${momentumFactor.exposure.toFixed(2)}), indicating contrarian positioning. While this can capture mean-reversion opportunities, be aware that "catching falling knives" can be risky in strong downtrends.`,
        confidence: momentumFactor.confidence,
      });
    }
  }

  // Analyze quality exposure
  const qualityFactors = factors.filter(f => ['roe', 'roa', 'gross_margin'].includes(f.factor));
  const avgQuality = qualityFactors.length > 0
    ? qualityFactors.reduce((sum, f) => sum + f.exposure, 0) / qualityFactors.length
    : 0;

  if (avgQuality > 0.4) {
    insights.push({
      type: 'opportunity',
      icon: <Shield className="w-4 h-4 text-[var(--color-info)]" />,
      title: 'Quality Tilt',
      content: `Your portfolio tilts toward high-quality companies. This exposure historically provides downside protection during market stress and tends to outperform over long horizons.`,
      confidence: 0.85,
    });
  }

  // Analyze sector concentration
  const sectorFactors = factors.filter(f => f.factor.startsWith('sector_') && f.exposure > 0.3);
  if (sectorFactors.length === 1) {
    const sector = sectorFactors[0].factor.replace('sector_', '').replace('_', ' ');
    insights.push({
      type: 'risk',
      icon: <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />,
      title: 'Sector Concentration',
      content: `Your portfolio is heavily concentrated in ${sector} (${(sectorFactors[0].exposure * 100).toFixed(0)}% exposure). Consider diversifying to reduce sector-specific risk. A sharp rotation out of ${sector} could significantly impact your returns.`,
      confidence: 0.9,
    });
  } else if (sectorFactors.length > 1) {
    const sectors = sectorFactors.map(f => f.factor.replace('sector_', '').replace('_', ' ')).join(', ');
    insights.push({
      type: 'factor',
      icon: <Zap className="w-4 h-4 text-[var(--color-accent)]" />,
      title: 'Multi-Sector Exposure',
      content: `Your portfolio has significant exposure to multiple sectors: ${sectors}. This diversification helps reduce idiosyncratic risk while maintaining growth potential.`,
      confidence: 0.8,
    });
  }

  // Analyze volatility exposure
  const volFactor = factors.find(f => f.factor === 'low_vol' || f.factor === 'volatility');
  if (volFactor && volFactor.factor === 'low_vol' && volFactor.exposure > 0.3) {
    insights.push({
      type: 'opportunity',
      icon: <Shield className="w-4 h-4 text-[var(--color-positive)]" />,
      title: 'Low Volatility Tilt',
      content: `Your portfolio favors low-volatility stocks. This "low vol anomaly" has historically delivered risk-adjusted returns above what CAPM would predict, particularly valuable during market corrections.`,
      confidence: volFactor.confidence,
    });
  }

  // Analyze macro sensitivity
  const macroFactors = factors.filter(f =>
    ['interest_rate_sensitivity', 'inflation_beta', 'vix_beta'].includes(f.factor)
  );
  const ratesFactor = macroFactors.find(f => f.factor === 'interest_rate_sensitivity');
  if (ratesFactor && Math.abs(ratesFactor.exposure) > 0.4) {
    const direction = ratesFactor.exposure > 0 ? 'positively' : 'negatively';
    insights.push({
      type: 'risk',
      icon: <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />,
      title: 'Interest Rate Sensitivity',
      content: `Your portfolio is ${direction} correlated with interest rate changes (${ratesFactor.exposure.toFixed(2)}). Monitor Fed policy and yield curve movements, as rate changes could significantly impact your returns.`,
      confidence: ratesFactor.confidence,
    });
  }

  // Add overall assessment if we have insights
  if (insights.length > 0) {
    const riskCount = insights.filter(i => i.type === 'risk').length;
    const oppCount = insights.filter(i => i.type === 'opportunity').length;

    if (riskCount > oppCount) {
      insights.unshift({
        type: 'action',
        icon: <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />,
        title: 'Portfolio Assessment',
        content: `I've identified ${riskCount} risk factors and ${oppCount} opportunities in your ${symbols.length}-position portfolio. Consider rebalancing to address the concentration and sensitivity risks highlighted below.`,
        confidence: 0.85,
      });
    } else {
      insights.unshift({
        type: 'action',
        icon: <Sparkles className="w-4 h-4 text-[var(--color-info)]" />,
        title: 'Portfolio Assessment',
        content: `Your ${symbols.length}-position portfolio shows ${oppCount} favorable factor tilts. The factor exposures align well with long-term return premiums documented in academic research.`,
        confidence: 0.85,
      });
    }
  }

  return insights;
}

export function CognitiveInsight({ symbols, factors = [] }: CognitiveInsightProps) {
  const [insights, setInsights] = useState<InsightSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Auto-generate insights when factors change
  useEffect(() => {
    if (factors.length > 0) {
      setInsights(generateInsights(symbols, factors));
      setLastUpdated(new Date());
    }
  }, [symbols, factors]);

  const refreshInsights = async () => {
    setIsLoading(true);
    try {
      // Fetch fresh factors if we have symbols
      if (symbols.length > 0) {
        const response = await api.get(`/portfolio/factors/${symbols.join(',')}`);
        const factorData = response.data || response;

        // Aggregate factors from all symbols
        const aggregatedFactors: FactorExposure[] = [];
        const factorTotals = new Map<string, { exposure: number; tStat: number; confidence: number; contribution: number; count: number }>();

        for (const symbol of symbols) {
          const symbolFactors = factorData[symbol] || [];
          for (const f of symbolFactors) {
            const existing = factorTotals.get(f.factor) || { exposure: 0, tStat: 0, confidence: 0, contribution: 0, count: 0 };
            factorTotals.set(f.factor, {
              exposure: existing.exposure + f.exposure,
              tStat: existing.tStat + f.tStat,
              confidence: existing.confidence + f.confidence,
              contribution: existing.contribution + f.contribution,
              count: existing.count + 1,
            });
          }
        }

        for (const [factor, totals] of factorTotals) {
          aggregatedFactors.push({
            factor,
            exposure: totals.exposure / totals.count,
            tStat: totals.tStat / totals.count,
            confidence: totals.confidence / totals.count,
            contribution: totals.contribution / totals.count,
          });
        }

        setInsights(generateInsights(symbols, aggregatedFactors));
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to refresh insights:', error);
      setInsights([{
        type: 'risk',
        icon: <AlertTriangle className="w-4 h-4 text-[var(--color-negative)]" />,
        title: 'Analysis Unavailable',
        content: 'Unable to generate insights at this time. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const insightTypeStyles = {
    risk: 'border-l-[var(--color-warning)]',
    opportunity: 'border-l-[var(--color-positive)]',
    action: 'border-l-[var(--color-info)]',
    factor: 'border-l-[var(--color-primary)]',
  };

  const insightTypeBg: Record<string, React.CSSProperties> = {
    risk: { backgroundColor: 'rgba(245, 158, 11, 0.08)' },
    opportunity: { backgroundColor: 'rgba(16, 185, 129, 0.08)' },
    action: { backgroundColor: 'rgba(59, 130, 246, 0.08)' },
    factor: { backgroundColor: 'rgba(123, 44, 255, 0.08)' },
  };

  return (
    <Card
      title="AI-Powered Insights"
      action={
        <Button onClick={refreshInsights} isLoading={isLoading} size="sm" variant="secondary">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
    >
      {insights.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)] opacity-50" />
          <p>Add positions to receive AI-powered analysis of your portfolio.</p>
          <p className="text-sm mt-2">
            Our cognitive engine analyzes 80+ factors to provide actionable insights.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border-l-4 animate-slide-in-left transition-shadow duration-200 hover:shadow-lg ${insightTypeStyles[insight.type]}`}
              style={{
                animationDelay: `${index * 50}ms`,
                animationFillMode: 'both',
                ...insightTypeBg[insight.type],
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{insight.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-[var(--color-text)]">{insight.title}</h4>
                    {insight.confidence && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {(insight.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{insight.content}</p>
                </div>
              </div>
            </div>
          ))}

          {lastUpdated && (
            <p className="text-xs text-[var(--color-text-muted)] text-right">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
