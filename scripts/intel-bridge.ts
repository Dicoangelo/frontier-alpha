#!/usr/bin/env npx tsx
/**
 * FRONTIER ALPHA — Intel Bridge
 *
 * Standalone CLI that strips Frontier Alpha's engines out of the server
 * and runs them directly from Claude Code (the substrate).
 *
 * Usage:
 *   npx tsx scripts/intel-bridge.ts regime AKT HNT NEAR OCEAN RENDER ICP
 *   npx tsx scripts/intel-bridge.ts optimize AKT HNT NEAR --objective max_sharpe
 *   npx tsx scripts/intel-bridge.ts scan AKT HNT NEAR OCEAN RENDER ICP WMTX
 *
 * Commands:
 *   regime   — HMM regime detection (bull/bear/sideways/volatile)
 *   optimize — Portfolio optimization (Sharpe/risk parity/CVaR)
 *   scan     — Full intelligence scan (regime + optimize + factor analysis)
 */

import { RegimeDetector } from '../src/ml/RegimeDetector.js';
import { PortfolioOptimizer } from '../src/optimizer/PortfolioOptimizer.js';
import { FactorEngine } from '../src/factors/FactorEngine.js';
import type { Price, OptimizationConfig } from '../src/types/index.js';

// ============================================================================
// POLYGON DATA FETCHER (direct, no server needed)
// ============================================================================

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'CmAs6neUzMxwYd2dHRMFHn7zrgRz8dKt';

interface PolygonBar {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

async function fetchCryptoPrices(symbol: string, days: number = 90): Promise<Price[]> {
  const ticker = symbol.includes(':') ? symbol : `X:${symbol.toUpperCase()}USD`;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as { results?: PolygonBar[], resultsCount?: number };

    if (!data.results || data.results.length === 0) {
      console.error(`  [WARN] No data for ${symbol} — trying stock ticker`);
      return fetchStockPrices(symbol, days);
    }

    return data.results.map((bar: PolygonBar) => ({
      symbol: symbol.toUpperCase(),
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));
  } catch (err) {
    console.error(`  [ERR] Failed to fetch ${symbol}: ${err}`);
    return [];
  }
}

async function fetchStockPrices(symbol: string, days: number = 90): Promise<Price[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as { results?: PolygonBar[] };

    if (!data.results || data.results.length === 0) {
      return [];
    }

    return data.results.map((bar: PolygonBar) => ({
      symbol: symbol.toUpperCase(),
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));
  } catch (err) {
    console.error(`  [ERR] Failed to fetch ${symbol}: ${err}`);
    return [];
  }
}

// ============================================================================
// DATA CACHE (shared between commands in a scan)
// ============================================================================

const priceCache = new Map<string, Price[]>();

// Crypto ticker mapping (symbol -> Polygon ticker)
const CRYPTO_TICKERS: Record<string, string> = {
  'NEAR': 'X:NEARUSD',
  'AKT': 'X:AKTUSD',
  'HNT': 'X:HNTUSD',
  'RENDER': 'X:RENDERUSD',
  'FIL': 'X:FILUSD',
  'ICP': 'X:ICPUSD',
  'OCEAN': 'X:OCEANUSD',
  'AR': 'X:ARUSD',
  'FET': 'X:FETUSD',
  'AGIX': 'X:AGIXUSD',
  'WMTX': 'X:WMTXUSD',
  'SOL': 'X:SOLUSD',
  'ETH': 'X:ETHUSD',
  'BTC': 'X:BTCUSD',
};

async function getCachedPrices(symbol: string, days: number = 90): Promise<Price[]> {
  if (priceCache.has(symbol)) return priceCache.get(symbol)!;

  // Use explicit ticker mapping to avoid stock/crypto confusion
  const ticker = CRYPTO_TICKERS[symbol.toUpperCase()] || `X:${symbol.toUpperCase()}USD`;
  const prices = await fetchCryptoPricesWithTicker(symbol, ticker, days);
  priceCache.set(symbol, prices);

  // Rate limit: 5 req/min on free Polygon tier
  await new Promise(r => setTimeout(r, 1200));
  return prices;
}

async function fetchCryptoPricesWithTicker(symbol: string, ticker: string, days: number = 90): Promise<Price[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as { results?: PolygonBar[], resultsCount?: number };

    if (!data.results || data.results.length === 0) {
      console.error(`  [WARN] No data for ${symbol} (${ticker})`);
      return [];
    }

    return data.results.map((bar: PolygonBar) => ({
      symbol: symbol.toUpperCase(),
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));
  } catch (err) {
    console.error(`  [ERR] Failed to fetch ${symbol}: ${err}`);
    return [];
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

async function regimeCommand(symbols: string[]) {
  const detector = new RegimeDetector();
  const results: Record<string, any> = {};

  console.error(`\n  ▸ REGIME DETECTION (HMM Baum-Welch + Viterbi)`);
  console.error(`  ▸ Symbols: ${symbols.join(', ')}`);
  console.error(`  ▸ Fetching 90 days of price data from Polygon.io...\n`);

  for (const symbol of symbols) {
    const prices = await getCachedPrices(symbol);

    if (prices.length < 22) {
      results[symbol] = { error: `Insufficient data (${prices.length} bars, need 22+)` };
      console.error(`  ${symbol}: ⚠ Insufficient data (${prices.length} bars)`);
      continue;
    }

    const regime = detector.detectRegime(prices);
    const latestPrice = prices[prices.length - 1].close;
    const priceChange30d = prices.length >= 30
      ? ((latestPrice - prices[prices.length - 30].close) / prices[prices.length - 30].close * 100).toFixed(2)
      : 'N/A';

    results[symbol] = {
      regime: regime.regime,
      confidence: Number(regime.confidence.toFixed(4)),
      probabilities: Object.fromEntries(
        Object.entries(regime.probabilities).map(([k, v]) => [k, Number(v.toFixed(4))])
      ),
      latestPrice,
      priceChange30d: priceChange30d === 'N/A' ? priceChange30d : `${priceChange30d}%`,
      dataPoints: prices.length,
    };

    const emoji = regime.regime === 'bull' ? '🟢' : regime.regime === 'bear' ? '🔴' : regime.regime === 'volatile' ? '🟡' : '⚪';
    console.error(`  ${symbol}: ${emoji} ${regime.regime.toUpperCase()} (${(regime.confidence * 100).toFixed(1)}% confidence) | $${latestPrice} | 30d: ${priceChange30d}%`);
  }

  return results;
}

async function optimizeCommand(symbols: string[], objective: string = 'max_sharpe') {
  const optimizer = new PortfolioOptimizer();

  console.error(`\n  ▸ PORTFOLIO OPTIMIZATION`);
  console.error(`  ▸ Objective: ${objective}`);
  console.error(`  ▸ Symbols: ${symbols.join(', ')}`);
  console.error(`  ▸ Fetching price data...\n`);

  const priceMap = new Map<string, Price[]>();
  const validSymbols: string[] = [];

  for (const symbol of symbols) {
    const prices = await getCachedPrices(symbol);
    if (prices.length >= 30) {
      priceMap.set(symbol, prices);
      validSymbols.push(symbol);
      console.error(`  ${symbol}: ${prices.length} bars loaded`);
    } else {
      console.error(`  ${symbol}: ⚠ Skipped (${prices.length} bars, need 30+)`);
    }
  }

  if (validSymbols.length < 2) {
    return { error: 'Need at least 2 assets with sufficient data' };
  }

  const config: OptimizationConfig = {
    objective: objective as any,
    riskFreeRate: 0.05,
    targetVolatility: 0.25,
    constraints: {
      minWeight: 0.02,
      maxWeight: 0.40,
    },
  };

  const result = await optimizer.optimize(validSymbols, priceMap, config);

  // Format output
  const weights: Record<string, string> = {};
  result.weights.forEach((w, s) => { weights[s] = `${(w * 100).toFixed(2)}%`; });

  console.error(`\n  ═══ OPTIMAL ALLOCATION (${objective}) ═══`);
  for (const [sym, w] of Object.entries(weights)) {
    const bar = '█'.repeat(Math.round(parseFloat(w) / 2));
    console.error(`  ${sym.padEnd(8)} ${w.padStart(8)} ${bar}`);
  }
  console.error(`\n  Expected Return: ${(result.expectedReturn * 100).toFixed(2)}%`);
  console.error(`  Expected Vol:    ${(result.expectedVolatility * 100).toFixed(2)}%`);
  console.error(`  Sharpe Ratio:    ${result.sharpeRatio.toFixed(3)}`);

  return {
    weights,
    expectedReturn: `${(result.expectedReturn * 100).toFixed(2)}%`,
    expectedVolatility: `${(result.expectedVolatility * 100).toFixed(2)}%`,
    sharpeRatio: Number(result.sharpeRatio.toFixed(3)),
    monteCarlo: result.monteCarlo ? {
      meanReturn: `${((result.monteCarlo as any).meanReturn * 100).toFixed(2)}%`,
      p5Return: `${((result.monteCarlo as any).percentile5 * 100).toFixed(2)}%`,
      p95Return: `${((result.monteCarlo as any).percentile95 * 100).toFixed(2)}%`,
    } : null,
    explanation: result.explanation,
  };
}

async function scanCommand(symbols: string[]) {
  console.error(`\n  ╔══════════════════════════════════════════════════╗`);
  console.error(`  ║  FRONTIER ALPHA — SOVEREIGN INTELLIGENCE SCAN   ║`);
  console.error(`  ╚══════════════════════════════════════════════════╝\n`);

  // Run regime detection on all
  const regimes = await regimeCommand(symbols);

  // Classify symbols by regime for smart allocation
  const bullish = Object.entries(regimes).filter(([_, r]) => r.regime === 'bull').map(([s]) => s);
  const bearish = Object.entries(regimes).filter(([_, r]) => r.regime === 'bear').map(([s]) => s);
  const volatile = Object.entries(regimes).filter(([_, r]) => r.regime === 'volatile').map(([s]) => s);
  const sideways = Object.entries(regimes).filter(([_, r]) => r.regime === 'sideways').map(([s]) => s);

  console.error(`\n  ═══ REGIME SUMMARY ═══`);
  if (bullish.length) console.error(`  🟢 BULL:     ${bullish.join(', ')}`);
  if (bearish.length) console.error(`  🔴 BEAR:     ${bearish.join(', ')}`);
  if (volatile.length) console.error(`  🟡 VOLATILE: ${volatile.join(', ')}`);
  if (sideways.length) console.error(`  ⚪ SIDEWAYS: ${sideways.join(', ')}`);

  // Optimize only assets with enough data
  const optimizable = Object.entries(regimes)
    .filter(([_, r]) => !r.error && r.dataPoints >= 30)
    .map(([s]) => s);

  let optimization = null;
  if (optimizable.length >= 2) {
    console.error('');
    optimization = await optimizeCommand(optimizable, 'max_sharpe');
  }

  return {
    timestamp: new Date().toISOString(),
    symbols: symbols.length,
    regimes,
    regimeSummary: { bullish, bearish, volatile, sideways },
    optimization,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse flags
  const flags: Record<string, string> = {};
  const symbols: string[] = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] || 'true';
      i++;
    } else {
      symbols.push(args[i].toUpperCase());
    }
  }

  let result: any;

  switch (command) {
    case 'regime':
      result = await regimeCommand(symbols);
      break;
    case 'optimize':
      result = await optimizeCommand(symbols, flags.objective || 'max_sharpe');
      break;
    case 'scan':
      result = await scanCommand(symbols);
      break;
    default:
      console.error('Usage: intel-bridge.ts <regime|optimize|scan> SYMBOL1 SYMBOL2 ...');
      console.error('  --objective max_sharpe|min_volatility|risk_parity|target_volatility');
      process.exit(1);
  }

  // Output JSON to stdout (stderr has human-readable output)
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
