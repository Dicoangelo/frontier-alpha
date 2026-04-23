import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface DashZoneProps {
  id: string;
  title: string;
  subtitle?: string;
  weight?: 'primary' | 'secondary' | 'tertiary';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  children: ReactNode;
}

const WEIGHT_STYLES: Record<NonNullable<DashZoneProps['weight']>, string> = {
  primary:
    'border-[var(--color-border)] bg-[var(--color-bg-secondary)]',
  secondary:
    'border-[var(--color-border-light)] bg-[var(--color-bg-secondary)]',
  tertiary:
    'border-[var(--color-border-light)] bg-[color-mix(in_srgb,var(--color-bg-secondary)_60%,transparent)]',
};

const WEIGHT_ACCENT: Record<NonNullable<DashZoneProps['weight']>, string> = {
  primary: 'var(--color-accent)',
  secondary: 'var(--color-accent-secondary)',
  tertiary: 'var(--color-text-muted)',
};

export function DashZone({
  id,
  title,
  subtitle,
  weight = 'secondary',
  collapsible = false,
  defaultCollapsed = false,
  className = '',
  children,
}: DashZoneProps) {
  const storageKey = `dash-zone:${id}:collapsed`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!collapsible) return false;
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? defaultCollapsed : v === '1';
    } catch {
      return defaultCollapsed;
    }
  });

  useEffect(() => {
    if (!collapsible) return;
    try {
      localStorage.setItem(storageKey, collapsed ? '1' : '0');
    } catch { /* quota */ }
  }, [collapsed, collapsible, storageKey]);

  const accent = WEIGHT_ACCENT[weight];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`rounded-sm border ${WEIGHT_STYLES[weight]} ${className}`}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[var(--color-border-light)]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-1 h-4 rounded-sm shrink-0"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id={`${id}-title`}
              className="text-[10px] mono tracking-[0.35em] uppercase text-[var(--color-text)] truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-controls={`${id}-body`}
            className="shrink-0 w-7 h-7 rounded-sm flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title={collapsed ? 'Expand zone' : 'Collapse zone'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                collapsed ? '-rotate-90' : 'rotate-0'
              }`}
            />
          </button>
        )}
      </header>
      {!collapsed && (
        <div id={`${id}-body`} className="p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}

export default DashZone;
