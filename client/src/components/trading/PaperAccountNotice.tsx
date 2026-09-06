import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * The Trade page runs a paper account (SimulatedBroker, $100K starting cash,
 * Supabase-persisted) that is a SEPARATE ledger from the tracked portfolio on
 * /portfolio. Both surfaces rendered a card called "Positions" with different
 * contents and nothing explained why — a walk as a fresh account showed
 * "AAPL · 2 sh" on Trade beside "No positions yet" on Portfolio. This is the
 * single place that states the relationship, so both cards can point at it.
 */
export function PaperAccountNotice({ variant = 'banner' }: { variant?: 'banner' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <p className="text-[11px] text-theme-muted leading-snug" data-testid="paper-account-notice">
        Paper-account holdings. Fills here never change your{' '}
        <Link to="/portfolio" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-accent-text)]">
          tracked portfolio
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-sm mt-2 text-theme-secondary" data-testid="paper-account-notice">
      This is a <strong className="text-theme">paper account</strong>, a separate ledger from the positions you
      track on the Portfolio page. Simulated fills settle here only.{' '}
      <Link
        to="/portfolio"
        className="inline-flex items-center gap-1 text-[var(--color-accent-text)] hover:underline underline-offset-2"
      >
        Tracked portfolio <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </p>
  );
}
