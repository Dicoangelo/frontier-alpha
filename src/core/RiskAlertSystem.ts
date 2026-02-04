/**
 * FRONTIER ALPHA - Risk Alert System
 *
 * Real-time monitoring and alerting for portfolio risks:
 * - Drawdown alerts
 * - Volatility spikes
 * - Factor exposure drift
 * - Concentration risk
 * - Correlation breakdown
 * - Liquidity warnings
 * - Earnings risk windows
 *
 * Delivers alerts via WebSocket, email, and push notifications.
 * Persists alerts to Supabase for history tracking.
 */

import type { Portfolio, FactorExposure, Quote } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertType = 
  | 'drawdown' 
  | 'volatility' 
  | 'factor_drift' 
  | 'concentration' 
  | 'correlation'
  | 'liquidity'
  | 'earnings_risk'
  | 'price_movement'
  | 'stop_loss'
  | 'take_profit';

export interface RiskAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  symbol?: string;
  title: string;
  message: string;
  metric: {
    name: string;
    current: number;
    threshold: number;
    unit: string;
  };
  timestamp: Date;
  acknowledged: boolean;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'reduce_position' | 'hedge' | 'rebalance' | 'investigate' | 'dismiss';
  label: string;
  params?: Record<string, unknown>;
}

export interface RiskThresholds {
  drawdown: { low: number; medium: number; high: number; critical: number };
  volatility: { low: number; medium: number; high: number; critical: number };
  concentration: { low: number; medium: number; high: number; critical: number };
  correlation: { low: number; medium: number; high: number };
  factorDrift: { low: number; medium: number; high: number };
}

export interface RiskMetrics {
  currentDrawdown: number;
  maxDrawdown: number;
  volatility21d: number;
  volatility5d: number;
  sharpeRatio: number;
  sortino: number;
  var95: number;
  cvar95: number;
  beta: number;
  correlationToSpy: number;
  topConcentration: number;
  factorDrifts: Map<string, number>;
}

// ============================================================================
// DEFAULT THRESHOLDS
// ============================================================================

const DEFAULT_THRESHOLDS: RiskThresholds = {
  drawdown: {
    low: 0.03,      // 3%
    medium: 0.05,   // 5%
    high: 0.08,     // 8%
    critical: 0.12, // 12%
  },
  volatility: {
    low: 0.15,      // 15% annualized
    medium: 0.20,   // 20%
    high: 0.30,     // 30%
    critical: 0.50, // 50%
  },
  concentration: {
    low: 0.15,      // 15% in single position
    medium: 0.20,   // 20%
    high: 0.25,     // 25%
    critical: 0.35, // 35%
  },
  correlation: {
    low: 0.7,       // High correlation warning
    medium: 0.8,
    high: 0.9,
  },
  factorDrift: {
    low: 0.3,       // Factor drift from target
    medium: 0.5,
    high: 0.8,
  },
};

// ============================================================================
// RISK ALERT SYSTEM
// ============================================================================

export class RiskAlertSystem {
  private thresholds: RiskThresholds;
  private alerts: Map<string, RiskAlert> = new Map();
  private subscribers: Set<(alert: RiskAlert) => void> = new Set();
  private portfolioMetrics: RiskMetrics | null = null;
  private highWaterMark: number = 0;
  private alertIdCounter = 0;
  private userId: string | null = null;
  private portfolioId: string | null = null;
  private useSupabase: boolean = !!process.env.SUPABASE_SERVICE_KEY;

  constructor(thresholds: Partial<RiskThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Set user context for alert persistence
   */
  setUserContext(userId: string, portfolioId?: string): void {
    this.userId = userId;
    this.portfolioId = portfolioId || null;
  }

  /**
   * Update portfolio metrics and check for alerts
   */
  async updateMetrics(
    portfolio: Portfolio,
    quotes: Map<string, Quote>,
    factorExposures: FactorExposure[],
    targetExposures?: FactorExposure[]
  ): Promise<RiskAlert[]> {
    const newAlerts: RiskAlert[] = [];

    // Calculate current portfolio value
    const currentValue = portfolio.totalValue;
    
    // Update high water mark
    if (currentValue > this.highWaterMark) {
      this.highWaterMark = currentValue;
    }

    // Calculate metrics
    this.portfolioMetrics = this.calculateMetrics(portfolio, quotes, factorExposures);

    // Check each risk dimension
    const drawdownAlert = this.checkDrawdown(this.portfolioMetrics.currentDrawdown);
    if (drawdownAlert) newAlerts.push(drawdownAlert);

    const volAlert = this.checkVolatility(this.portfolioMetrics.volatility5d);
    if (volAlert) newAlerts.push(volAlert);

    const concentrationAlert = this.checkConcentration(portfolio);
    if (concentrationAlert) newAlerts.push(concentrationAlert);

    const factorAlerts = this.checkFactorDrift(factorExposures, targetExposures);
    newAlerts.push(...factorAlerts);

    // Check individual position alerts
    for (const position of portfolio.positions) {
      const quote = quotes.get(position.symbol);
      if (!quote) continue;

      const posAlerts = this.checkPositionRisk(position, quote);
      newAlerts.push(...posAlerts);
    }

    // Notify subscribers
    for (const alert of newAlerts) {
      this.alerts.set(alert.id, alert);
      this.notifySubscribers(alert);
    }

    return newAlerts;
  }

  /**
   * Subscribe to real-time alerts
   */
  subscribe(callback: (alert: RiskAlert) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): RiskAlert[] {
    return Array.from(this.alerts.values())
      .filter(a => !a.acknowledged)
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get current risk metrics
   */
  getMetrics(): RiskMetrics | null {
    return this.portfolioMetrics;
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<RiskThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  // ============================================================================
  // RISK CHECKS
  // ============================================================================

  private checkDrawdown(drawdown: number): RiskAlert | null {
    const { low, medium, high, critical } = this.thresholds.drawdown;

    if (drawdown < low) return null;

    const severity: AlertSeverity = 
      drawdown >= critical ? 'critical' :
      drawdown >= high ? 'high' :
      drawdown >= medium ? 'medium' : 'low';

    return this.createAlert({
      type: 'drawdown',
      severity,
      title: `Portfolio Drawdown: ${(drawdown * 100).toFixed(1)}%`,
      message: this.getDrawdownMessage(drawdown, severity),
      metric: {
        name: 'drawdown',
        current: drawdown,
        threshold: severity === 'critical' ? critical : severity === 'high' ? high : medium,
        unit: '%',
      },
      actions: [
        { type: 'reduce_position', label: 'Reduce exposure' },
        { type: 'hedge', label: 'Add hedges' },
        { type: 'dismiss', label: 'Dismiss' },
      ],
    });
  }

  private checkVolatility(vol: number): RiskAlert | null {
    const { low, medium, high, critical } = this.thresholds.volatility;

    if (vol < low) return null;

    const severity: AlertSeverity = 
      vol >= critical ? 'critical' :
      vol >= high ? 'high' :
      vol >= medium ? 'medium' : 'low';

    return this.createAlert({
      type: 'volatility',
      severity,
      title: `Volatility Spike: ${(vol * 100).toFixed(1)}% annualized`,
      message: `Portfolio volatility has increased significantly. Current 5-day realized volatility is ${(vol * 100).toFixed(1)}% annualized, above your ${(this.thresholds.volatility[severity === 'low' ? 'low' : severity === 'medium' ? 'medium' : 'high'] * 100).toFixed(0)}% threshold.`,
      metric: {
        name: 'volatility',
        current: vol,
        threshold: severity === 'critical' ? critical : severity === 'high' ? high : medium,
        unit: '%',
      },
      actions: [
        { type: 'reduce_position', label: 'Reduce risk' },
        { type: 'rebalance', label: 'Rebalance' },
        { type: 'dismiss', label: 'Dismiss' },
      ],
    });
  }

  private checkConcentration(portfolio: Portfolio): RiskAlert | null {
    const { low, medium, high, critical } = this.thresholds.concentration;

    // Find max position weight
    const maxWeight = Math.max(...portfolio.positions.map(p => p.weight));
    const topPosition = portfolio.positions.find(p => p.weight === maxWeight);

    if (maxWeight < low) return null;

    const severity: AlertSeverity = 
      maxWeight >= critical ? 'critical' :
      maxWeight >= high ? 'high' :
      maxWeight >= medium ? 'medium' : 'low';

    return this.createAlert({
      type: 'concentration',
      severity,
      symbol: topPosition?.symbol,
      title: `Concentration Risk: ${topPosition?.symbol} at ${(maxWeight * 100).toFixed(1)}%`,
      message: `Your position in ${topPosition?.symbol} represents ${(maxWeight * 100).toFixed(1)}% of your portfolio, exceeding your ${(this.thresholds.concentration[severity === 'low' ? 'low' : severity === 'medium' ? 'medium' : 'high'] * 100).toFixed(0)}% concentration limit.`,
      metric: {
        name: 'concentration',
        current: maxWeight,
        threshold: severity === 'critical' ? critical : severity === 'high' ? high : medium,
        unit: '%',
      },
      actions: [
        { type: 'reduce_position', label: `Trim ${topPosition?.symbol}` },
        { type: 'rebalance', label: 'Rebalance portfolio' },
        { type: 'dismiss', label: 'Dismiss' },
      ],
    });
  }

  private checkFactorDrift(
    current: FactorExposure[],
    target?: FactorExposure[]
  ): RiskAlert[] {
    if (!target) return [];

    const alerts: RiskAlert[] = [];
    const { low, medium, high } = this.thresholds.factorDrift;

    for (const currentExp of current) {
      const targetExp = target.find(t => t.factor === currentExp.factor);
      if (!targetExp) continue;

      const drift = Math.abs(currentExp.exposure - targetExp.exposure);
      
      if (drift < low) continue;

      const severity: AlertSeverity = 
        drift >= high ? 'high' :
        drift >= medium ? 'medium' : 'low';

      alerts.push(this.createAlert({
        type: 'factor_drift',
        severity,
        title: `Factor Drift: ${currentExp.factor}`,
        message: `${currentExp.factor} exposure drifted from target ${targetExp.exposure.toFixed(2)} to ${currentExp.exposure.toFixed(2)} (drift: ${drift.toFixed(2)}).`,
        metric: {
          name: `${currentExp.factor}_drift`,
          current: drift,
          threshold: severity === 'high' ? high : medium,
          unit: 'units',
        },
        actions: [
          { type: 'rebalance', label: 'Rebalance to target' },
          { type: 'investigate', label: 'Analyze drift' },
          { type: 'dismiss', label: 'Dismiss' },
        ],
      }));
    }

    return alerts;
  }

  private checkPositionRisk(
    position: { symbol: string; costBasis: number; currentPrice: number; weight: number },
    quote: Quote
  ): RiskAlert[] {
    const alerts: RiskAlert[] = [];

    // Check price movement
    const priceChange = (quote.last - position.costBasis) / position.costBasis;

    // Stop loss check (20% loss)
    if (priceChange < -0.20) {
      alerts.push(this.createAlert({
        type: 'stop_loss',
        severity: 'high',
        symbol: position.symbol,
        title: `Stop Loss: ${position.symbol} down ${(Math.abs(priceChange) * 100).toFixed(1)}%`,
        message: `${position.symbol} has declined ${(Math.abs(priceChange) * 100).toFixed(1)}% from your cost basis. Consider cutting losses.`,
        metric: {
          name: 'price_change',
          current: priceChange,
          threshold: -0.20,
          unit: '%',
        },
        actions: [
          { type: 'reduce_position', label: `Sell ${position.symbol}` },
          { type: 'hedge', label: 'Add put protection' },
          { type: 'dismiss', label: 'Keep position' },
        ],
      }));
    }

    // Take profit check (50% gain)
    if (priceChange > 0.50) {
      alerts.push(this.createAlert({
        type: 'take_profit',
        severity: 'info',
        symbol: position.symbol,
        title: `Take Profit: ${position.symbol} up ${(priceChange * 100).toFixed(1)}%`,
        message: `${position.symbol} has gained ${(priceChange * 100).toFixed(1)}% from your cost basis. Consider taking profits.`,
        metric: {
          name: 'price_change',
          current: priceChange,
          threshold: 0.50,
          unit: '%',
        },
        actions: [
          { type: 'reduce_position', label: 'Take partial profits' },
          { type: 'dismiss', label: 'Let it ride' },
        ],
      }));
    }

    return alerts;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateMetrics(
    portfolio: Portfolio,
    quotes: Map<string, Quote>,
    factorExposures: FactorExposure[]
  ): RiskMetrics {
    const currentValue = portfolio.totalValue;
    const drawdown = this.highWaterMark > 0
      ? (this.highWaterMark - currentValue) / this.highWaterMark
      : 0;

    // Calculate volatility from recent quote changes
    const priceChanges: number[] = [];
    for (const position of portfolio.positions) {
      const quote = quotes.get(position.symbol);
      if (quote && quote.changePercent !== undefined) {
        // Weight by position size
        priceChanges.push(quote.changePercent * position.weight);
      }
    }

    // Portfolio daily return approximation
    const portfolioReturn = priceChanges.reduce((sum, r) => sum + r, 0) / 100;

    // Annualized volatility from recent returns (using stored history would be better)
    // For now, estimate from single-day change with scaling
    const dailyVol = Math.abs(portfolioReturn) * 1.5;  // Rough scaling
    const vol21d = dailyVol * Math.sqrt(21);
    const vol5d = dailyVol * Math.sqrt(5) * 1.2;  // Short-term vol tends to be higher

    // Find market factor for beta
    const marketFactor = factorExposures.find(f => f.factor === 'market');
    const beta = marketFactor?.exposure || 1.0;

    // VaR and CVaR (95% confidence, assuming normal distribution)
    // VaR_95 = -μ + σ * 1.645 (daily)
    const riskFreeDaily = 0.05 / 252;  // 5% annual risk-free rate
    const expectedDailyReturn = riskFreeDaily + beta * 0.0003;  // Simple CAPM
    const var95 = -expectedDailyReturn + dailyVol * 1.645;
    const cvar95 = -expectedDailyReturn + dailyVol * 2.063;  // Expected shortfall

    // Sharpe and Sortino ratios (annualized)
    const annualReturn = expectedDailyReturn * 252;
    const annualVol = dailyVol * Math.sqrt(252);
    const sharpeRatio = annualVol > 0 ? (annualReturn - 0.05) / annualVol : 0;

    // Sortino uses downside deviation
    const downsideVol = dailyVol * 0.7;  // Approximate downside volatility
    const sortino = downsideVol > 0 ? (annualReturn - 0.05) / (downsideVol * Math.sqrt(252)) : 0;

    // Top concentration
    const topConcentration = portfolio.positions.length > 0
      ? Math.max(...portfolio.positions.map(p => p.weight))
      : 0;

    // Factor drifts (from target of 0 if no target specified)
    const factorDrifts = new Map<string, number>();
    for (const f of factorExposures) {
      factorDrifts.set(f.factor, Math.abs(f.exposure));  // Drift from neutral
    }

    return {
      currentDrawdown: Math.max(0, drawdown),
      maxDrawdown: Math.max(0, this.maxDrawdownSeen || drawdown),
      volatility21d: Math.max(0.01, Math.min(1.0, vol21d)),
      volatility5d: Math.max(0.01, Math.min(1.5, vol5d)),
      sharpeRatio: Math.max(-5, Math.min(5, sharpeRatio)),
      sortino: Math.max(-5, Math.min(5, sortino)),
      var95: Math.max(0, Math.min(0.5, var95)),
      cvar95: Math.max(0, Math.min(0.5, cvar95)),
      beta: Math.max(0, Math.min(3, beta)),
      correlationToSpy: 0.85,  // Would need SPY returns to calculate
      topConcentration,
      factorDrifts,
    };
  }

  private maxDrawdownSeen = 0;

  private createAlert(params: Omit<RiskAlert, 'id' | 'timestamp' | 'acknowledged'>): RiskAlert {
    return {
      ...params,
      id: `alert_${++this.alertIdCounter}_${Date.now()}`,
      timestamp: new Date(),
      acknowledged: false,
    };
  }

  private getDrawdownMessage(drawdown: number, severity: AlertSeverity): string {
    const pct = (drawdown * 100).toFixed(1);
    const messages: Record<AlertSeverity, string> = {
      critical: `CRITICAL: Portfolio has declined ${pct}% from peak. Immediate risk reduction recommended.`,
      high: `Portfolio is in significant drawdown at ${pct}%. Consider defensive actions.`,
      medium: `Portfolio drawdown of ${pct}% requires attention.`,
      low: `Minor drawdown of ${pct}% detected.`,
      info: `Drawdown: ${pct}%`,
    };
    return messages[severity];
  }

  private notifySubscribers(alert: RiskAlert): void {
    for (const callback of this.subscribers) {
      try {
        callback(alert);
      } catch (e) {
        console.error('Alert subscriber error:', e);
      }
    }

    // Persist to Supabase asynchronously
    this.persistAlert(alert).catch(e => {
      console.warn('Failed to persist alert:', e);
    });
  }

  /**
   * Persist alert to Supabase
   */
  private async persistAlert(alert: RiskAlert): Promise<void> {
    if (!this.useSupabase || !this.userId) return;

    try {
      await supabaseAdmin
        .from('frontier_risk_alerts')
        .insert({
          id: alert.id,
          user_id: this.userId,
          portfolio_id: this.portfolioId,
          alert_type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metadata: {
            symbol: alert.symbol,
            metric: alert.metric,
            actions: alert.actions,
          },
          created_at: alert.timestamp.toISOString(),
        });
    } catch (e) {
      console.error('Supabase alert persistence error:', e);
    }
  }

  /**
   * Load alerts from Supabase for a user
   */
  async loadAlerts(userId: string): Promise<RiskAlert[]> {
    if (!this.useSupabase) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('frontier_risk_alerts')
        .select('*')
        .eq('user_id', userId)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        type: row.alert_type as AlertType,
        severity: row.severity as AlertSeverity,
        symbol: row.metadata?.symbol,
        title: row.title,
        message: row.message,
        metric: row.metadata?.metric || { name: '', current: 0, threshold: 0, unit: '' },
        timestamp: new Date(row.created_at),
        acknowledged: !!row.acknowledged_at,
        actions: row.metadata?.actions || [],
      }));
    } catch (e) {
      console.error('Failed to load alerts from Supabase:', e);
      return [];
    }
  }

  /**
   * Acknowledge alert in Supabase
   */
  async acknowledgeAlertPersistent(alertId: string): Promise<boolean> {
    const success = this.acknowledgeAlert(alertId);

    if (success && this.useSupabase) {
      try {
        await supabaseAdmin
          .from('frontier_risk_alerts')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', alertId);
      } catch (e) {
        console.error('Failed to acknowledge alert in Supabase:', e);
      }
    }

    return success;
  }

  /**
   * Format alert for display
   */
  formatAlertMarkdown(alert: RiskAlert): string {
    const severityIcons: Record<AlertSeverity, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    };

    return `${severityIcons[alert.severity]} **${alert.title}**

${alert.message}

**Metric:** ${alert.metric.name} = ${(alert.metric.current * (alert.metric.unit === '%' ? 100 : 1)).toFixed(2)}${alert.metric.unit} (threshold: ${(alert.metric.threshold * (alert.metric.unit === '%' ? 100 : 1)).toFixed(2)}${alert.metric.unit})

_${alert.timestamp.toLocaleString()}_`;
  }
}

export const riskAlertSystem = new RiskAlertSystem();
