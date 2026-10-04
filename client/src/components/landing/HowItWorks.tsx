import { ArrowRight, ListPlus, Layers3, ClipboardList } from 'lucide-react';

export interface HowItWorksProps { onCTAClick: () => void; }

const STEPS = [
  { icon: ListPlus, title: 'Add your holdings', body: 'Start with the ticker symbols you want to explore. Use one of the sample portfolios or enter your own.' },
  { icon: Layers3, title: 'Review your exposure', body: 'Explore factors such as quality, momentum, and value to understand the mix behind your positions.' },
  { icon: ClipboardList, title: 'Put the analysis in context', body: 'Review explanations, portfolio risk, and upcoming events together as part of your research.' },
];

export function HowItWorks({ onCTAClick }: HowItWorksProps) {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="border-t border-[var(--color-border-light)] px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold text-[var(--color-accent-text)]">How it works</p><h2 id="how-it-works-heading" className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">From holdings to understanding</h2></div>
          <button type="button" onClick={onCTAClick} className="inline-flex items-center gap-2 rounded-md py-2 text-sm font-semibold text-[var(--color-accent-text)] hover:underline">Explore a portfolio <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-accent-text)]"><Icon size={20} aria-hidden="true" /></span><span className="text-xs font-medium text-[var(--color-text-muted)]">Step {index + 1}</span></div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
