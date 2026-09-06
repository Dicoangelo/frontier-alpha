import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EarningsCalendar } from './EarningsCalendar';

describe('EarningsCalendar empty states', () => {
  it('says the calendar is unavailable when the provider could not resolve the symbols', () => {
    render(<EarningsCalendar earnings={[]} unavailable={['NVDA', 'AAPL']} daysAhead={30} selectedSymbol={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('earnings-calendar-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Calendar unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/NVDA, AAPL/)).toBeInTheDocument();
    expect(screen.queryByText(/Add positions/)).not.toBeInTheDocument();
  });

  it('says nothing is scheduled (not "add positions") when the calendar resolved and is empty', () => {
    render(<EarningsCalendar earnings={[]} unavailable={[]} daysAhead={30} selectedSymbol={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('earnings-calendar-empty')).toBeInTheDocument();
    expect(screen.getByText(/next 30 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Add positions/)).not.toBeInTheDocument();
  });
});
