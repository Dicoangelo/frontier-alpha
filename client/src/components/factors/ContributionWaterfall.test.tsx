import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { aggregateContributions, ContributionWaterfall } from './ContributionWaterfall';
import type { FactorExposureWithCategory } from '@/api/factors';

function f(
  factor: string,
  contribution: number,
  category: FactorExposureWithCategory['category'] = 'style',
  exposure = 1,
): FactorExposureWithCategory {
  return { factor, exposure, tStat: 2, confidence: 0.9, contribution, category };
}

describe('aggregateContributions', () => {
  it('sums contributions across holdings for the same factor', () => {
    const model = aggregateContributions([
      f('momentum_12m', 0.4),
      f('momentum_12m', 0.2),
      f('value', -0.1),
    ]);
    const momentum = model.steps.find((s) => s.factor === 'momentum_12m');
    expect(momentum?.contribution).toBeCloseTo(0.6, 6);
    expect(momentum?.count).toBe(2);
  });

  it('net equals the sum of every input contribution', () => {
    const model = aggregateContributions([
      f('a', 0.5),
      f('b', -0.3),
      f('c', 0.1),
    ]);
    expect(model.net).toBeCloseTo(0.3, 6);
  });

  it('ranks steps by magnitude of contribution', () => {
    const model = aggregateContributions([
      f('small', 0.05),
      f('big', -0.9),
      f('mid', 0.4),
    ]);
    expect(model.steps.map((s) => s.factor)).toEqual(['big', 'mid', 'small']);
  });

  it('buckets everything past topN into Other without changing net', () => {
    const factors = Array.from({ length: 12 }, (_, i) => f(`factor_${i}`, (i + 1) * 0.1));
    const model = aggregateContributions(factors, 8);
    expect(model.steps).toHaveLength(9); // 8 + Other
    const other = model.steps.find((s) => s.factor === 'Other');
    expect(other).toBeDefined();
    const stepSum = model.steps.reduce((sum, s) => sum + s.contribution, 0);
    expect(stepSum).toBeCloseTo(model.net, 6);
  });

  it('flags an all-zero contribution set as empty', () => {
    const model = aggregateContributions([f('a', 0), f('b', 0)]);
    expect(model.empty).toBe(true);
  });
});

describe('<ContributionWaterfall />', () => {
  it('renders the net signal and ranked factor rows', () => {
    render(
      <ContributionWaterfall
        factors={[f('momentum_12m', 0.6), f('value', -0.2, 'style')]}
      />,
    );
    expect(screen.getByText('Signal Contribution Waterfall')).toBeInTheDocument();
    expect(screen.getByText('Net Signal')).toBeInTheDocument();
    // 0.6 - 0.2 = +0.400
    expect(screen.getByText('+0.400')).toBeInTheDocument();
    expect(screen.getByText('Momentum 12m')).toBeInTheDocument();
  });

  it('renders nothing when there is no contribution signal', () => {
    const { container } = render(
      <ContributionWaterfall factors={[f('a', 0), f('b', 0)]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty factor list', () => {
    const { container } = render(<ContributionWaterfall factors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
