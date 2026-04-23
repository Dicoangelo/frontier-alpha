import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Moon, Sun, LogOut, Command as CommandIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

interface CommandItem {
  id: string;
  label: string;
  group: 'Navigate' | 'Actions' | 'Preferences';
  icon?: React.ReactNode;
  keywords?: string;
  perform: () => void | Promise<void>;
}

function score(item: CommandItem, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const hay = `${item.label} ${item.group} ${item.keywords || ''}`.toLowerCase();
  if (hay.startsWith(q)) return 100;
  if (hay.includes(q)) return 60;
  // subsequence match (fuzzy)
  let qi = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) qi++;
  }
  return qi === q.length ? 30 - (hay.length - q.length) * 0.1 : 0;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const nav = (path: string) => () => { navigate(path); close(); };
    return [
      { id: 'go-dash', label: 'Dashboard', group: 'Navigate', keywords: 'home overview', perform: nav('/dashboard') },
      { id: 'go-portfolio', label: 'Portfolio', group: 'Navigate', keywords: 'positions holdings', perform: nav('/portfolio') },
      { id: 'go-trade', label: 'Trade', group: 'Navigate', keywords: 'buy sell order', perform: nav('/trade') },
      { id: 'go-options', label: 'Options', group: 'Navigate', keywords: 'greeks calls puts', perform: nav('/options') },
      { id: 'go-factors', label: 'Factors', group: 'Navigate', keywords: 'exposures style quality', perform: nav('/factors') },
      { id: 'go-cvrf', label: 'CVRF Beliefs', group: 'Navigate', keywords: 'learning episodes', perform: nav('/cvrf') },
      { id: 'go-earnings', label: 'Earnings Calendar', group: 'Navigate', keywords: 'reports quarterly', perform: nav('/earnings') },
      { id: 'go-alerts', label: 'Alerts', group: 'Navigate', keywords: 'notifications risk', perform: nav('/alerts') },
      { id: 'go-optimize', label: 'Optimize', group: 'Navigate', keywords: 'monte carlo sharpe', perform: nav('/optimize') },
      { id: 'go-backtest', label: 'Backtest', group: 'Navigate', keywords: 'history walk forward', perform: nav('/backtest') },
      { id: 'go-ml', label: 'ML Engine', group: 'Navigate', keywords: 'neural regime', perform: nav('/ml') },
      { id: 'go-tax', label: 'Tax', group: 'Navigate', keywords: 'harvest lot', perform: nav('/tax') },
      { id: 'go-social', label: 'Social', group: 'Navigate', keywords: 'leaderboard share', perform: nav('/social') },
      { id: 'go-settings', label: 'Settings', group: 'Navigate', keywords: 'preferences account', perform: nav('/settings') },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        group: 'Preferences',
        icon: theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        keywords: 'theme dark light mode',
        perform: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); close(); },
      },
      {
        id: 'logout',
        label: 'Sign out',
        group: 'Actions',
        icon: <LogOut className="w-4 h-4" />,
        keywords: 'logout exit leave',
        perform: async () => { await logout(); close(); navigate('/landing'); },
      },
    ];
  }, [navigate, close, theme, setTheme, logout]);

  const filtered = useMemo(() => {
    const ranked = commands
      .map((c) => ({ c, s: score(c, query) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ c }) => c);
    return ranked;
  }, [commands, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filtered.forEach((c) => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    return groups;
  }, [filtered]);

  // Global shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Keep active in range
  useEffect(() => { setActive(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[active]?.perform();
    }
  };

  if (!open) return null;

  let runningIndex = 0;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-bg)_70%,black_30%)] backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-2xl animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-light)]">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to page, run command…"
            className="flex-1 bg-transparent outline-none text-[var(--color-text)] placeholder-[var(--color-text-muted)] text-sm"
          />
          <kbd className="hidden sm:inline text-[9px] mono tracking-[0.2em] uppercase px-2 py-0.5 rounded-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[var(--color-text-muted)] text-sm">
              No matches
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="py-1">
                <div className="px-4 pt-2 pb-1 text-[9px] mono tracking-[0.35em] uppercase text-[var(--color-text-muted)]">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = runningIndex++;
                  const isActive = idx === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.perform()}
                      onMouseMove={() => setActive(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-[color-mix(in_srgb,var(--brand-amethyst)_14%,transparent)] text-[var(--color-text)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <span className="shrink-0 text-[var(--color-text-muted)]">
                        {item.icon ?? <ArrowRight className="w-4 h-4" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{item.label}</span>
                      {isActive && (
                        <kbd className="text-[9px] mono tracking-[0.2em] uppercase px-2 py-0.5 rounded-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--color-border-light)] text-[9px] mono tracking-[0.2em] uppercase text-[var(--color-text-muted)]">
          <span className="flex items-center gap-2">
            <CommandIcon className="w-3 h-3" />
            Cmd / Ctrl + K to open anywhere
          </span>
          <span>↑ ↓ Enter</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
