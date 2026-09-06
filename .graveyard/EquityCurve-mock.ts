/**
 * ARCHIVED 2026-09-06 from client/src/components/charts/EquityCurve.tsx.
 *
 * Seeded random-walk equity curve used as the fallback whenever the Dashboard
 * passed no return series — which it never did, so every account (demo AND
 * funded) saw the same synthetic "+11.22% vs S&P +10.34%" under a LIVE badge.
 * Replaced by client/src/lib/equitySeries.ts (today's holdings marked to
 * cached daily closes) with an honest "unavailable" state when history is
 * missing. Kept here because a deterministic seeded walk is useful for visual
 * regression fixtures / Storybook; reconnect by importing generateMockData
 * into a test-only fixture, never into the live chart.
 */
interface DataPoint { date: string; portfolio: number; benchmark: number }

// Seeded pseudo-random for deterministic mock data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}


// Generate mock data for demo — deterministic per timeframe
function generateMockData(currentValue: number, days: number): DataPoint[] {
  const rand = seededRandom(days * 7919 + 42);
  const points: DataPoint[] = [];
  const now = new Date();

  let portfolioValue = currentValue * 0.85;
  let benchmarkValue = currentValue * 0.88;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    points.push({
      date: date.toISOString().split('T')[0],
      portfolio: portfolioValue,
      benchmark: benchmarkValue,
    });

    // Deterministic walk with slight upward bias
    portfolioValue *= 1 + (rand() - 0.45) * 0.015;
    benchmarkValue *= 1 + (rand() - 0.47) * 0.012;
  }

  // Adjust to match current value
  const scale = currentValue / points[points.length - 1].portfolio;
  return points.map(p => ({
    ...p,
    portfolio: p.portfolio * scale,
    benchmark: p.benchmark * scale * 0.95,
  }));
}

