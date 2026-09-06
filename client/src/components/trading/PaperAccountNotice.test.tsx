import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PaperAccountNotice } from './PaperAccountNotice';

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PaperAccountNotice', () => {
  it('states that the paper account is a separate ledger and links to the tracked portfolio', () => {
    renderIn(<PaperAccountNotice />);
    expect(screen.getByTestId('paper-account-notice')).toHaveTextContent(/separate ledger/i);
    expect(screen.getByRole('link', { name: /tracked portfolio/i })).toHaveAttribute('href', '/portfolio');
  });

  it('inline variant says fills never touch the tracked portfolio', () => {
    renderIn(<PaperAccountNotice variant="inline" />);
    expect(screen.getByTestId('paper-account-notice')).toHaveTextContent(/never change your/i);
    expect(screen.getByRole('link', { name: /tracked portfolio/i })).toHaveAttribute('href', '/portfolio');
  });
});
