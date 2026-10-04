import { Activity, CalendarDays, FileText } from 'lucide-react';

export interface TrustComparisonProps { className?: string; }

const FEATURES = [
  { icon: Activity, title: 'Understand your risk', body: 'Review concentration, drawdowns, and factor exposures alongside the positions that contribute to them.' },
  { icon: FileText, title: 'Follow the reasoning', body: 'Use explanations and factor breakdowns to inspect an analysis and decide what deserves a closer look.' },
  { icon: CalendarDays, title: 'Keep context close', body: 'Bring earnings events, portfolio alerts, and research into the same workspace as your holdings.' },
];

export function TrustComparison({ className = '' }: TrustComparisonProps) {
  return (
    <section aria-labelledby="why-frontier-alpha-heading" className={`border-t border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-4 py-12 sm:px-6 sm:py-16 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <h2 id="why-frontier-alpha-heading" className="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">More context for your next review</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">A connected workspace for keeping track of your portfolio and exploring the questions behind the numbers.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {FEATURES.map(({icon: Icon, title, body}) => <article key={title} className="rounded-xl border border-[var(--color-border)] p-6"><Icon size={22} className="text-[var(--color-accent-text)]" aria-hidden="true" /><h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{body}</p></article>)}
        </div>
      </div>
    </section>
  );
}

export default TrustComparison;
