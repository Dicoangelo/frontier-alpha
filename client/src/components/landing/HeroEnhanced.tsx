import { ArrowRight, ChartNoAxesCombined, Layers3, ShieldCheck } from 'lucide-react';
import { TypingTickerDemo } from './TypingTickerDemo';

export interface HeroEnhancedProps {
  onAnalyze: () => void;
  onLoadDemo: () => void;
  isAnalyzing: boolean;
}

export function HeroEnhanced({ onAnalyze, onLoadDemo, isAnalyzing }: HeroEnhancedProps) {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-20" aria-labelledby="landing-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="mb-5 text-sm font-semibold text-[var(--color-accent-text)]">Portfolio analytics, explained</p>
          <h1 id="landing-heading" className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight text-[var(--color-text)] sm:text-5xl lg:text-[54px]">
            A clearer view of your portfolio.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
            Understand what drives your holdings. Bring performance, factor exposure, and risk into one workspace, with explanations you can review.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={onAnalyze} disabled={isAnalyzing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
              Explore your portfolio <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={onLoadDemo} disabled={isAnalyzing} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50">
              {isAnalyzing ? 'Loading sample…' : 'Try a sample portfolio'}
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">Explore the sample without creating an account.</p>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 border-t border-[var(--color-border-light)] pt-6 text-sm text-[var(--color-text-secondary)]">
            <span className="inline-flex items-center gap-2"><ChartNoAxesCombined size={16} aria-hidden="true" /> Portfolio overview</span>
            <span className="inline-flex items-center gap-2"><Layers3 size={16} aria-hidden="true" /> Factor analysis</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={16} aria-hidden="true" /> Risk monitoring</span>
          </div>
        </div>
        <TypingTickerDemo />
      </div>
    </section>
  );
}

export default HeroEnhanced;
