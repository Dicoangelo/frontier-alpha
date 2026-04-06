import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';
import { AlertDelivery, type AlertPayload, type UserNotificationSettings } from '../notifications/AlertDelivery.js';
import axios from 'axios';

interface RouteContext {
  server: unknown;
}

export async function alertsRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/alerts
  fastify.get<{ Reply: APIResponse<unknown[]> }>(
    '/api/v1/alerts',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_risk_alerts')
        .select('*')
        .eq('user_id', request.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ err: error }, 'Failed to fetch alerts');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to load alerts' },
        });
      }

      return {
        success: true,
        data: data || [],
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // PUT /api/v1/alerts/:id/acknowledge
  fastify.put<{
    Params: { id: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/alerts/:id/acknowledge',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_risk_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', request.user.id)
        .select()
        .single();

      if (error) {
        logger.error({ err: error }, 'Failed to acknowledge alert');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge alert' },
        });
      }

      return {
        success: true,
        data,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // ---------------------------------------------------------------------------
  // Factor Drift interfaces, constants, and helpers
  // ---------------------------------------------------------------------------

  interface FactorTarget {
    factor: string;
    target: number;
    tolerance: number;
  }

  interface FactorExposure {
    factor: string;
    exposure: number;
  }

  interface DriftResult {
    factor: string;
    current: number;
    target: number;
    drift: number;
    driftPct: number;
    withinTolerance: boolean;
  }

  interface DriftAlert {
    id: string;
    type: 'factor_drift';
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    message: string;
    timestamp: string;
    acknowledged: false;
    factor: string;
    currentExposure: number;
    targetExposure: number;
    driftPct: number;
    suggestedAction: string;
  }

  const DEFAULT_TARGETS: FactorTarget[] = [
    { factor: 'momentum_12m', target: 0, tolerance: 0.3 },
    { factor: 'value', target: 0, tolerance: 0.3 },
    { factor: 'low_vol', target: 0, tolerance: 0.3 },
    { factor: 'roe', target: 0.2, tolerance: 0.25 },
    { factor: 'market', target: 1.0, tolerance: 0.15 },
  ];

  const STRATEGY_PRESETS: Record<string, FactorTarget[]> = {
    balanced: DEFAULT_TARGETS,
    momentum: [
      { factor: 'momentum_12m', target: 0.5, tolerance: 0.2 },
      { factor: 'momentum_6m', target: 0.4, tolerance: 0.2 },
      { factor: 'low_vol', target: -0.2, tolerance: 0.3 },
    ],
    quality: [
      { factor: 'roe', target: 0.6, tolerance: 0.2 },
      { factor: 'roa', target: 0.4, tolerance: 0.25 },
      { factor: 'gross_margin', target: 0.3, tolerance: 0.25 },
    ],
    lowVol: [
      { factor: 'low_vol', target: 0.6, tolerance: 0.15 },
      { factor: 'volatility', target: -0.4, tolerance: 0.2 },
      { factor: 'market', target: 0.7, tolerance: 0.15 },
    ],
  };

  function formatFactorName(factor: string): string {
    const nameMap: Record<string, string> = {
      momentum_12m: '12-Month Momentum',
      momentum_6m: '6-Month Momentum',
      value: 'Value',
      low_vol: 'Low Volatility',
      roe: 'Return on Equity',
      roa: 'Return on Assets',
      gross_margin: 'Gross Margin',
      market: 'Market Beta',
      volatility: 'Volatility',
    };
    return nameMap[factor] || factor.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function calculateSeverity(driftPct: number): 'critical' | 'high' | 'medium' | 'low' {
    const absDrift = Math.abs(driftPct);
    if (absDrift > 0.75) return 'critical';
    if (absDrift > 0.5) return 'high';
    if (absDrift > 0.35) return 'medium';
    return 'low';
  }

  function checkDrift(exposures: FactorExposure[], targets: FactorTarget[]): DriftResult[] {
    return targets.map((t) => {
      const exp = exposures.find((e) => e.factor === t.factor);
      const current = exp ? exp.exposure : 0;
      const drift = current - t.target;
      const driftPct = t.tolerance > 0 ? drift / t.tolerance : drift;
      return {
        factor: t.factor,
        current,
        target: t.target,
        drift,
        driftPct,
        withinTolerance: Math.abs(drift) <= t.tolerance,
      };
    });
  }

  function generateAlerts(driftResults: DriftResult[]): DriftAlert[] {
    return driftResults
      .filter((d) => !d.withinTolerance)
      .map((d) => {
        const severity = calculateSeverity(d.driftPct);
        const factorName = formatFactorName(d.factor);
        const direction = d.drift > 0 ? 'above' : 'below';
        return {
          id: `drift-${d.factor}-${Date.now()}`,
          type: 'factor_drift' as const,
          severity,
          title: `${factorName} Drift Detected`,
          message: `${factorName} exposure is ${Math.abs(d.drift).toFixed(3)} ${direction} target (${d.current.toFixed(3)} vs ${d.target.toFixed(3)})`,
          timestamp: new Date().toISOString(),
          acknowledged: false as const,
          factor: d.factor,
          currentExposure: d.current,
          targetExposure: d.target,
          driftPct: d.driftPct,
          suggestedAction: d.drift > 0
            ? `Reduce ${factorName} exposure by ${Math.abs(d.drift).toFixed(3)}`
            : `Increase ${factorName} exposure by ${Math.abs(d.drift).toFixed(3)}`,
        };
      });
  }

  // GET /api/v1/alerts/factor-drift — default targets & strategy presets
  fastify.get('/api/v1/alerts/factor-drift', async (request, reply) => {
    const start = Date.now();
    try {
      return {
        success: true,
        data: {
          defaultTargets: DEFAULT_TARGETS,
          strategyPresets: STRATEGY_PRESETS,
          factorNames: Object.fromEntries(
            [...DEFAULT_TARGETS, ...STRATEGY_PRESETS.momentum, ...STRATEGY_PRESETS.quality, ...STRATEGY_PRESETS.lowVol]
              .map((t) => [t.factor, formatFactorName(t.factor)])
          ),
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Failed to get factor drift config');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get factor drift configuration' },
      });
    }
  });

  // POST /api/v1/alerts/factor-drift — calculate drift & generate alerts
  fastify.post<{
    Body: { exposures: FactorExposure[]; targets?: FactorTarget[] };
  }>('/api/v1/alerts/factor-drift', async (request, reply) => {
    const start = Date.now();
    try {
      const { exposures, targets } = request.body;

      if (!exposures || !Array.isArray(exposures)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'exposures array is required' },
        });
      }

      const activeTargets = targets && targets.length > 0 ? targets : DEFAULT_TARGETS;
      const driftResults = checkDrift(exposures, activeTargets);
      const alerts = generateAlerts(driftResults);

      const withinTolerance = driftResults.filter((d) => d.withinTolerance).length;
      const outsideTolerance = driftResults.filter((d) => !d.withinTolerance).length;
      const worstDrift = driftResults.reduce(
        (worst, d) => (Math.abs(d.driftPct) > Math.abs(worst.driftPct) ? d : worst),
        driftResults[0]
      );

      let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (alerts.some((a) => a.severity === 'critical')) {
        overallHealth = 'critical';
      } else if (outsideTolerance > 0) {
        overallHealth = 'warning';
      }

      return {
        success: true,
        data: {
          driftResults,
          alerts,
          summary: {
            totalFactorsTracked: driftResults.length,
            factorsWithinTolerance: withinTolerance,
            factorsOutsideTolerance: outsideTolerance,
            worstDrift: worstDrift
              ? {
                  factor: worstDrift.factor,
                  driftPct: worstDrift.driftPct,
                  name: formatFactorName(worstDrift.factor),
                }
              : null,
            overallHealth,
          },
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Factor drift calculation failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Factor drift calculation failed' },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/alerts/notify — send alert notifications
  // ---------------------------------------------------------------------------

  const userSettingsStore = new Map<string, UserNotificationSettings>();

  fastify.post<{
    Body: {
      alerts: AlertPayload[];
      userId?: string;
      email?: string;
      mode?: 'immediate' | 'digest';
      settings?: Partial<UserNotificationSettings>;
    };
  }>('/api/v1/alerts/notify', async (request, reply) => {
    const start = Date.now();
    try {
      const { alerts, userId, email, mode, settings: settingsOverride } = request.body;

      if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'alerts array is required and must not be empty' },
        });
      }

      if (!userId && !email) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'userId or email is required' },
        });
      }

      const effectiveUserId = userId || email || 'anonymous';

      // Merge stored settings with overrides
      const storedSettings = userSettingsStore.get(effectiveUserId);
      const userSettings: UserNotificationSettings = {
        userId: effectiveUserId,
        email: email || storedSettings?.email || '',
        emailEnabled: settingsOverride?.emailEnabled ?? storedSettings?.emailEnabled ?? true,
        pushEnabled: settingsOverride?.pushEnabled ?? storedSettings?.pushEnabled,
        severityThreshold: settingsOverride?.severityThreshold || storedSettings?.severityThreshold || 'low',
        alertTypes: settingsOverride?.alertTypes || storedSettings?.alertTypes || [],
        digestFrequency: settingsOverride?.digestFrequency || storedSettings?.digestFrequency || 'immediate',
      };

      // Persist merged settings
      userSettingsStore.set(effectiveUserId, userSettings);

      const delivery = new AlertDelivery({
        provider: (process.env.EMAIL_PROVIDER as 'resend' | 'sendgrid' | 'console') || 'console',
        apiKey: process.env.EMAIL_API_KEY,
        fromEmail: process.env.EMAIL_FROM,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
      });

      const results: Array<{ alertId: string; success: boolean; messageId?: string; error?: string }> = [];
      let sent = 0;
      let failed = 0;

      if (mode === 'digest') {
        const result = await delivery.sendDigest(alerts, userSettings);
        if (result.success) {
          sent = alerts.length;
        } else {
          failed = alerts.length;
        }
        results.push({
          alertId: 'digest',
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      } else {
        for (const alert of alerts) {
          const result = await delivery.sendAlert(alert, userSettings);
          results.push({
            alertId: alert.id,
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          });
          if (result.success) {
            sent++;
          } else {
            failed++;
          }
        }
      }

      return {
        success: true,
        data: {
          sent,
          failed,
          total: alerts.length,
          mode: mode || 'immediate',
          results,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Notification delivery failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Notification delivery failed' },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // SEC Filing Alerts — GET & POST /api/v1/alerts/sec-filings
  // ---------------------------------------------------------------------------

  const TICKER_CIK_MAP: Record<string, number> = {
    AAPL: 320193,
    MSFT: 789019,
    NVDA: 1045810,
    GOOGL: 1652044,
    AMZN: 1018724,
    META: 1326801,
    TSLA: 1318605,
    BRK: 1067983,
    JPM: 19617,
    V: 1403161,
    JNJ: 200406,
    WMT: 104169,
    PG: 80424,
    MA: 1141391,
    UNH: 731766,
    HD: 354950,
    DIS: 1744489,
    BAC: 70858,
    ADBE: 796343,
    CRM: 1108524,
  };

  const FILING_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    '8-K': 'high',
    '10-K': 'medium',
    '10-Q': 'medium',
    '4': 'high',
    'SC 13D': 'critical',
    'SC 13G': 'high',
    '13F-HR': 'medium',
    'DEF 14A': 'low',
    'S-1': 'critical',
    'S-3': 'medium',
    '424B': 'medium',
  };

  function getSuggestedAction(formType: string, symbol: string): string {
    const actions: Record<string, string> = {
      '8-K': `Review material event disclosure for ${symbol}`,
      '10-K': `Analyze annual report for ${symbol}`,
      '10-Q': `Review quarterly results for ${symbol}`,
      '4': `Check insider trading activity for ${symbol}`,
      'SC 13D': `Monitor activist investor position in ${symbol}`,
      'SC 13G': `Review passive large holder filing for ${symbol}`,
      '13F-HR': `Analyze institutional holdings changes for ${symbol}`,
      'DEF 14A': `Review proxy statement and governance for ${symbol}`,
      'S-1': `Evaluate new offering prospectus for ${symbol}`,
      'S-3': `Review shelf registration for ${symbol}`,
    };
    return actions[formType] || `Review ${formType} filing for ${symbol}`;
  }

  async function fetchSECFilings(symbols: string[]): Promise<DriftAlert[]> {
    const alerts: DriftAlert[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const symbol of symbols) {
      const cik = TICKER_CIK_MAP[symbol.toUpperCase()];
      if (!cik) {
        logger.warn({ symbol }, 'No CIK mapping found for symbol');
        continue;
      }

      const paddedCik = String(cik).padStart(10, '0');

      try {
        const response = await axios.get(
          `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
          {
            headers: {
              'User-Agent': 'Frontier-Alpha/1.0 (contact@frontier-alpha.com)',
              Accept: 'application/json',
            },
            timeout: 10000,
          }
        );

        const filings = response.data?.filings?.recent;
        if (!filings || !filings.form) continue;

        const count = Math.min(filings.form.length, 10);
        for (let i = 0; i < count; i++) {
          const filingDate = new Date(filings.filingDate[i]);
          if (filingDate < thirtyDaysAgo) continue;

          const formType = filings.form[i];
          const severity = FILING_SEVERITY[formType] || 'low';

          alerts.push({
            id: `sec-${symbol}-${filings.accessionNumber[i]}`,
            type: 'factor_drift' as const,
            severity,
            title: `${symbol}: ${formType} Filing`,
            message: `${filings.primaryDocument?.[i] || formType} filed on ${filings.filingDate[i]}`,
            timestamp: filingDate.toISOString(),
            acknowledged: false as const,
            factor: formType,
            currentExposure: 0,
            targetExposure: 0,
            driftPct: 0,
            suggestedAction: getSuggestedAction(formType, symbol),
          });
        }

        // Rate limit: 150ms between requests
        if (symbols.indexOf(symbol) < symbols.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } catch (err) {
        logger.error({ err, symbol }, 'Failed to fetch SEC filings');
      }
    }

    return alerts;
  }

  // GET /api/v1/alerts/sec-filings
  fastify.get<{
    Querystring: { symbols?: string };
  }>('/api/v1/alerts/sec-filings', async (request, reply) => {
    const start = Date.now();
    try {
      const symbolsParam = (request.query as { symbols?: string }).symbols || 'AAPL,MSFT,NVDA,GOOGL,AMZN';
      const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase());

      const alerts = await fetchSECFilings(symbols);

      const summaryBySeverity = {
        critical: alerts.filter((a) => a.severity === 'critical').length,
        high: alerts.filter((a) => a.severity === 'high').length,
        medium: alerts.filter((a) => a.severity === 'medium').length,
        low: alerts.filter((a) => a.severity === 'low').length,
      };

      return {
        success: true,
        data: {
          alerts,
          summary: {
            totalFilings: alerts.length,
            symbolsQueried: symbols,
            bySeverity: summaryBySeverity,
          },
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'SEC filings fetch failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch SEC filings' },
      });
    }
  });

  // POST /api/v1/alerts/sec-filings
  fastify.post<{
    Body: { symbols: string[] };
  }>('/api/v1/alerts/sec-filings', async (request, reply) => {
    const start = Date.now();
    try {
      const { symbols } = request.body;

      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbols array is required' },
        });
      }

      if (symbols.length > 20) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Maximum 20 symbols allowed per request' },
        });
      }

      const normalizedSymbols = symbols.map((s: string) => s.trim().toUpperCase());
      const alerts = await fetchSECFilings(normalizedSymbols);

      return {
        success: true,
        data: {
          alerts,
          summary: {
            totalFilings: alerts.length,
            symbolsQueried: normalizedSymbols,
          },
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'SEC filings fetch failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch SEC filings' },
      });
    }
  });
}
