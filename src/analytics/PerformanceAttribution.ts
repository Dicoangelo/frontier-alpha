/**
 * PerformanceAttribution - Portfolio return decomposition
 *
 * Implements:
 * 1. Brinson Attribution - allocation, selection, interaction effects
 * 2. Factor Attribution - return contribution by factor
 * 3. Sector Attribution - return by sector allocation
 */

interface Position {
  symbol: string;
  weight: number;
  return: number;
  sector?: string;
}

interface BenchmarkPosition {
  symbol: string;
  weight: number;
  return: number;
  sector?: string;
}

interface SectorWeight {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export interface BrinsonAttribution {
  totalReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  sectorBreakdown: Array<{
    sector: string;
    allocation: number;
    selection: number;
    interaction: number;
    total: number;
  }>;
}

export interface FactorAttribution {
  totalReturn: number;
  factorReturn: number;
  specificReturn: number;
  factors: Array<{
    factor: string;
    exposure: number;
    factorReturn: number;
    contribution: number;
  }>;
}

export interface AttributionSummary {
  period: string;
  startDate: string;
  endDate: string;
  brinson: BrinsonAttribution;
  factor: FactorAttribution;
  topContributors: Array<{
    symbol: string;
    contribution: number;
    weight: number;
  }>;
  topDetractors: Array<{
    symbol: string;
    contribution: number;
    weight: number;
  }>;
}

// GICS sector mapping for common symbols
const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology',
  MSFT: 'Technology',
  GOOGL: 'Technology',
  META: 'Technology',
  NVDA: 'Technology',
  AMD: 'Technology',
  AMZN: 'Consumer Discretionary',
  TSLA: 'Consumer Discretionary',
  JPM: 'Financials',
  BAC: 'Financials',
  GS: 'Financials',
  V: 'Financials',
  MA: 'Financials',
  JNJ: 'Healthcare',
  UNH: 'Healthcare',
  PFE: 'Healthcare',
  MRK: 'Healthcare',
  XOM: 'Energy',
  CVX: 'Energy',
  NEE: 'Utilities',
  DUK: 'Utilities',
  PG: 'Consumer Staples',
  KO: 'Consumer Staples',
  PEP: 'Consumer Staples',
  LIN: 'Materials',
  HON: 'Industrials',
  UNP: 'Industrials',
  CAT: 'Industrials',
  AMT: 'Real Estate',
  SPG: 'Real Estate',
};

// S&P 500 sector weights (approximate)
const BENCHMARK_SECTOR_WEIGHTS: Record<string, number> = {
  Technology: 0.28,
  Financials: 0.13,
  Healthcare: 0.13,
  'Consumer Discretionary': 0.10,
  'Consumer Staples': 0.07,
  Industrials: 0.09,
  Energy: 0.05,
  Materials: 0.03,
  Utilities: 0.03,
  'Real Estate': 0.03,
  Communications: 0.06,
};

export class PerformanceAttribution {
  /**
   * Calculate Brinson attribution (Brinson-Fachler model)
   */
  static calculateBrinson(
    portfolioPositions: Position[],
    benchmarkPositions: BenchmarkPosition[]
  ): BrinsonAttribution {
    // Group by sector
    const sectorWeights = this.groupBySector(portfolioPositions, benchmarkPositions);

    // Calculate total returns
    const portfolioReturn = portfolioPositions.reduce(
      (sum, p) => sum + p.weight * p.return,
      0
    );
    const benchmarkReturn = benchmarkPositions.reduce(
      (sum, p) => sum + p.weight * p.return,
      0
    );
    const activeReturn = portfolioReturn - benchmarkReturn;

    // Calculate effects by sector
    let totalAllocation = 0;
    let totalSelection = 0;
    let totalInteraction = 0;

    const sectorBreakdown = sectorWeights.map((sw) => {
      // Allocation effect: (Wp - Wb) * (Rb - Rtotal_benchmark)
      const allocation = (sw.portfolioWeight - sw.benchmarkWeight) * (sw.benchmarkReturn - benchmarkReturn);

      // Selection effect: Wb * (Rp - Rb)
      const selection = sw.benchmarkWeight * (sw.portfolioReturn - sw.benchmarkReturn);

      // Interaction effect: (Wp - Wb) * (Rp - Rb)
      const interaction = (sw.portfolioWeight - sw.benchmarkWeight) * (sw.portfolioReturn - sw.benchmarkReturn);

      totalAllocation += allocation;
      totalSelection += selection;
      totalInteraction += interaction;

      return {
        sector: sw.sector,
        allocation,
        selection,
        interaction,
        total: allocation + selection + interaction,
      };
    });

    return {
      totalReturn: portfolioReturn,
      benchmarkReturn,
      activeReturn,
      allocationEffect: totalAllocation,
      selectionEffect: totalSelection,
      interactionEffect: totalInteraction,
      sectorBreakdown: sectorBreakdown.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    };
  }

  /**
   * Calculate factor-based attribution
   */
  static calculateFactorAttribution(
    portfolioReturn: number,
    factorExposures: Array<{ factor: string; exposure: number }>,
    factorReturns: Record<string, number>
  ): FactorAttribution {
    let factorReturn = 0;
    const factors: Array<{
      factor: string;
      exposure: number;
      factorReturn: number;
      contribution: number;
    }> = [];

    for (const exposure of factorExposures) {
      const factorRet = factorReturns[exposure.factor] || 0;
      const contribution = exposure.exposure * factorRet;
      factorReturn += contribution;

      factors.push({
        factor: exposure.factor,
        exposure: exposure.exposure,
        factorReturn: factorRet,
        contribution,
      });
    }

    // Specific (idiosyncratic) return
    const specificReturn = portfolioReturn - factorReturn;

    return {
      totalReturn: portfolioReturn,
      factorReturn,
      specificReturn,
      factors: factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    };
  }

  /**
   * Calculate full attribution summary
   */
  static calculateAttribution(
    portfolioPositions: Position[],
    benchmarkPositions: BenchmarkPosition[],
    factorExposures: Array<{ factor: string; exposure: number }>,
    factorReturns: Record<string, number>,
    period: { start: string; end: string; label: string }
  ): AttributionSummary {
    // Calculate Brinson attribution
    const brinson = this.calculateBrinson(portfolioPositions, benchmarkPositions);

    // Calculate factor attribution
    const factor = this.calculateFactorAttribution(
      brinson.totalReturn,
      factorExposures,
      factorReturns
    );

    // Calculate individual stock contributions
    const contributions = portfolioPositions.map((p) => ({
      symbol: p.symbol,
      contribution: p.weight * p.return,
      weight: p.weight,
    }));

    contributions.sort((a, b) => b.contribution - a.contribution);

    const topContributors = contributions.slice(0, 5).filter((c) => c.contribution > 0);
    const topDetractors = contributions
      .slice(-5)
      .reverse()
      .filter((c) => c.contribution < 0);

    return {
      period: period.label,
      startDate: period.start,
      endDate: period.end,
      brinson,
      factor,
      topContributors,
      topDetractors,
    };
  }

  /**
   * Group positions by sector
   */
  private static groupBySector(
    portfolioPositions: Position[],
    benchmarkPositions: BenchmarkPosition[]
  ): SectorWeight[] {
    const sectors = new Map<string, SectorWeight>();

    // Initialize with benchmark sectors
    for (const [sector, weight] of Object.entries(BENCHMARK_SECTOR_WEIGHTS)) {
      sectors.set(sector, {
        sector,
        portfolioWeight: 0,
        benchmarkWeight: weight,
        portfolioReturn: 0,
        benchmarkReturn: 0,
      });
    }

    // Add portfolio positions
    for (const pos of portfolioPositions) {
      const sector = pos.sector || SECTOR_MAP[pos.symbol] || 'Other';
      const existing = sectors.get(sector) || {
        sector,
        portfolioWeight: 0,
        benchmarkWeight: 0,
        portfolioReturn: 0,
        benchmarkReturn: 0,
      };

      existing.portfolioWeight += pos.weight;
      // Weighted average return
      if (existing.portfolioWeight > 0) {
        existing.portfolioReturn =
          (existing.portfolioReturn * (existing.portfolioWeight - pos.weight) +
            pos.return * pos.weight) /
          existing.portfolioWeight;
      }

      sectors.set(sector, existing);
    }

    // Add benchmark positions
    for (const pos of benchmarkPositions) {
      const sector = pos.sector || SECTOR_MAP[pos.symbol] || 'Other';
      const existing = sectors.get(sector);
      if (existing) {
        // Update benchmark return (weighted average)
        const totalWeight = existing.benchmarkWeight;
        if (totalWeight > 0) {
          existing.benchmarkReturn =
            (existing.benchmarkReturn * (totalWeight - pos.weight) + pos.return * pos.weight) /
            totalWeight;
        }
      }
    }

    return Array.from(sectors.values()).filter(
      (s) => s.portfolioWeight > 0 || s.benchmarkWeight > 0
    );
  }

  /**
   * Generate mock attribution for demo/development
   */
  static generateMockAttribution(symbols: string[]): AttributionSummary {
    // Generate mock returns for each symbol
    const portfolioPositions: Position[] = symbols.map((symbol, _i) => {
      const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      return {
        symbol,
        weight: 1 / symbols.length,
        return: (hash % 20 - 5) / 100, // -5% to +15%
        sector: SECTOR_MAP[symbol] || 'Other',
      };
    });

    // Generate simple benchmark (market proxy)
    const benchmarkPositions: BenchmarkPosition[] = Object.entries(BENCHMARK_SECTOR_WEIGHTS).map(
      ([sector, weight]) => ({
        symbol: sector,
        weight,
        return: 0.02 + Math.random() * 0.03, // 2-5% market return
        sector,
      })
    );

    // Mock factor exposures
    const factorExposures = [
      { factor: 'market', exposure: 1.05 },
      { factor: 'size', exposure: -0.2 },
      { factor: 'value', exposure: 0.15 },
      { factor: 'momentum', exposure: 0.3 },
      { factor: 'quality', exposure: 0.25 },
    ];

    // Mock factor returns
    const factorReturns: Record<string, number> = {
      market: 0.03,
      size: -0.01,
      value: 0.005,
      momentum: 0.02,
      quality: 0.015,
    };

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    return this.calculateAttribution(
      portfolioPositions,
      benchmarkPositions,
      factorExposures,
      factorReturns,
      {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        label: '1M',
      }
    );
  }
}
