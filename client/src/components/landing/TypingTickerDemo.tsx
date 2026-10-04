import { useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';

const SCENES = [
  { symbol: 'NVDA', name: 'NVIDIA', factors: [{ name: 'Momentum', weight: 91 }, { name: 'Quality', weight: 72 }, { name: 'AI capex', weight: 88 }, { name: 'Valuation', weight: -54 }] },
  { symbol: 'AAPL', name: 'Apple', factors: [{ name: 'Quality', weight: 82 }, { name: 'Low volatility', weight: 58 }, { name: 'Buyback yield', weight: 61 }, { name: 'Growth', weight: -18 }] },
  { symbol: 'GOOGL', name: 'Alphabet', factors: [{ name: 'Quality', weight: 79 }, { name: 'AI exposure', weight: 55 }, { name: 'Valuation', weight: 31 }, { name: 'Regulatory', weight: -42 }] },
];

/** A static, explicitly illustrative preview; it never represents live quotes. */
export function TypingTickerDemo() {
  const [active, setActive] = useState(0);
  const scene = SCENES[active];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-light)] px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><ChartNoAxesCombined size={17} className="text-[var(--color-accent-text)]" aria-hidden="true" /> Factor overview</div>
        <span className="rounded-md bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)]">Sample data</span>
      </div>
      <div className="p-5 sm:p-6">
        <div className="mb-6 flex gap-2" aria-label="Sample holdings">
          {SCENES.map((item, index) => (
            <button key={item.symbol} type="button" onClick={() => setActive(index)} aria-pressed={index === active} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${index === active ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-text)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}>{item.symbol}</button>
          ))}
        </div>
        <div className="mb-6 flex items-baseline gap-3"><h2 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{scene.symbol}</h2><span className="text-sm text-[var(--color-text-secondary)]">{scene.name}</span></div>
        <div className="mb-3 flex items-center justify-between text-xs text-[var(--color-text-muted)]"><span>Factor</span><span>Exposure score</span></div>
        <div className="space-y-4">
          {scene.factors.map(factor => (
            <div key={factor.name} className="grid grid-cols-[100px_1fr_36px] items-center gap-3 sm:grid-cols-[120px_1fr_36px]">
              <span className="text-xs text-[var(--color-text-secondary)]">{factor.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]"><div className="h-full rounded-full" style={{width: `${Math.abs(factor.weight)}%`, background: factor.weight >= 0 ? 'var(--color-accent)' : 'var(--color-negative)'}} /></div>
              <span className="text-right text-xs font-medium tabular-nums" style={{color: factor.weight >= 0 ? 'var(--color-text)' : 'var(--color-negative)'}}>{factor.weight > 0 ? '+' : ''}{factor.weight}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-lg bg-[var(--color-bg-tertiary)] p-4">
          <p className="text-xs font-semibold text-[var(--color-text)]">See the factors behind each position</p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">Compare the strength and direction of individual exposures alongside your portfolio.</p>
        </div>
        <p className="mt-4 text-[11px] leading-4 text-[var(--color-text-muted)]">Illustrative values to preview the interface. Not a live assessment or investment recommendation.</p>
      </div>
    </div>
  );
}

export default TypingTickerDemo;
