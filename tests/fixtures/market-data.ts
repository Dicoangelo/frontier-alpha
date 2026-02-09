/**
 * Test Fixtures: Market Data
 * Realistic mock data for E2E tests
 */

// ============================================================================
// QUOTES
// ============================================================================

export function mockQuote(symbol: string) {
  const prices: Record<string, number> = {
    AAPL: 227.63,
    MSFT: 415.20,
    GOOGL: 176.45,
    NVDA: 875.30,
    AMZN: 185.92,
    META: 502.15,
    JPM: 198.40,
    V: 282.55,
    JNJ: 155.30,
    UNH: 520.80,
    SPY: 502.10,
  };

  const price = prices[symbol] || 100 + Math.random() * 400;
  const change = +(Math.random() * 6 - 3).toFixed(2);
  const changePercent = +((change / price) * 100).toFixed(2);

  return {
    symbol,
    last: price,
    bid: +(price - 0.02).toFixed(2),
    ask: +(price + 0.02).toFixed(2),
    change,
    changePercent,
    volume: Math.floor(Math.random() * 50_000_000) + 5_000_000,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// FACTOR EXPOSURES
// ============================================================================

export function mockFactorExposures(symbol: string) {
  return [
    { factor: 'market', exposure: 1.05 + Math.random() * 0.3, confidence: 0.95 },
    { factor: 'momentum_12m', exposure: 0.15 + Math.random() * 0.5, confidence: 0.82 },
    { factor: 'momentum_6m', exposure: 0.10 + Math.random() * 0.4, confidence: 0.78 },
    { factor: 'volatility', exposure: -(0.1 + Math.random() * 0.3), confidence: 0.88 },
    { factor: 'quality', exposure: 0.2 + Math.random() * 0.3, confidence: 0.75 },
    { factor: 'value', exposure: -(0.05 + Math.random() * 0.2), confidence: 0.70 },
    { factor: 'size', exposure: 0.3 + Math.random() * 0.2, confidence: 0.65 },
    { factor: 'growth', exposure: 0.25 + Math.random() * 0.3, confidence: 0.72 },
  ];
}

// ============================================================================
// EARNINGS
// ============================================================================

export function mockEarnings(symbols: string[]) {
  const now = new Date();
  return symbols.slice(0, 5).map((symbol, i) => {
    const reportDate = new Date(now);
    reportDate.setDate(reportDate.getDate() + i * 3 + 1);

    return {
      symbol,
      reportDate: reportDate.toISOString().split('T')[0],
      reportTime: i % 2 === 0 ? 'AMC' : 'BMO',
      epsEstimate: +(1.5 + Math.random() * 3).toFixed(2),
      revenueEstimate: Math.floor(50 + Math.random() * 100) * 1_000_000_000,
      expectedMove: +(2 + Math.random() * 5).toFixed(1),
      recommendation: ['hold', 'reduce', 'hedge', 'trim'][i % 4],
    };
  });
}

export function mockEarningsHistory(symbol: string) {
  const quarters = [];
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i * 3);
    quarters.push({
      symbol,
      reportDate: date.toISOString().split('T')[0],
      epsActual: +(1.2 + Math.random() * 3).toFixed(2),
      epsEstimate: +(1.5 + Math.random() * 2.5).toFixed(2),
      surprise: +(Math.random() * 10 - 3).toFixed(2),
      priceReaction: +(Math.random() * 8 - 4).toFixed(2),
    });
  }
  return quarters;
}

export function mockEarningsForecast(symbol: string) {
  return {
    symbol,
    expectedMove: +(3 + Math.random() * 4).toFixed(1),
    confidence: +(0.6 + Math.random() * 0.3).toFixed(2),
    factorAdjustment: +(Math.random() * 2 - 1).toFixed(2),
    sentimentAdjustment: +(Math.random() * 1.5 - 0.5).toFixed(2),
    historicalAccuracy: +(0.65 + Math.random() * 0.2).toFixed(2),
    direction: Math.random() > 0.5 ? 'bullish' : 'bearish',
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export function mockHealthCheck() {
  return {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.4',
    environment: 'test',
    checks: {
      api: { status: 'ok', latencyMs: 2 },
      database: { status: 'ok' },
      external: { status: 'ok' },
    },
    metrics: {
      uptime: 3600,
      memoryUsage: 128,
      requestCount: 42,
    },
  };
}

// ============================================================================
// AUTH
// ============================================================================

export function mockSignupResponse(email: string) {
  return {
    success: true,
    data: {
      user: {
        id: `user-${Math.random().toString(36).slice(2, 8)}`,
        email,
        created_at: new Date().toISOString(),
      },
      confirmationRequired: true,
    },
  };
}

export function mockAuthError(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
    meta: {
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// META HELPERS
// ============================================================================

export function mockMeta() {
  return {
    timestamp: new Date().toISOString(),
    requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
    latencyMs: Math.floor(Math.random() * 20) + 1,
  };
}
