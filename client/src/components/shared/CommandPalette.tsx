import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpRight, Moon, Sun, LogOut, X, Workflow, PanelLeft, PanelRight, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { OverlayPortal } from './OverlayPortal';
import { useThemeStore } from '@/stores/themeStore';

interface CommandItem {
  id: string;
  label: string;
  group: 'Navigate' | 'Account' | 'Appearance' | 'Workspace' | 'Research';
  keywords: string;
  icon?: React.ReactNode;
  perform: () => void | Promise<void>;
}

const routes = [
  ['/', 'Dashboard', 'home overview'], ['/portfolio', 'Portfolio', 'positions holdings'],
  ['/trade', 'Trade', 'buy sell order execution'], ['/options', 'Options', 'greeks calls puts'],
  ['/research', 'Agent research', 'deepseek ai agent evidence analysis brief'], ['/factors', 'Factors', 'exposure quality momentum'], ['/cvrf', 'CVRF beliefs', 'learning episodes'],
  ['/earnings', 'Earnings', 'calendar reports quarterly'], ['/alerts', 'Alerts', 'notifications risk'],
  ['/optimize', 'Optimize', 'allocation monte carlo sharpe'], ['/backtest', 'Backtest', 'history strategy'],
  ['/ml', 'Models', 'ml neural regime'], ['/tax', 'Tax', 'harvest lots'],
  ['/social', 'Community', 'social leaderboard share'], ['/insights', 'Insights', 'research explanations'],
  ['/settings', 'Settings', 'preferences account'], ['/help', 'Help', 'documentation guide'],
];

interface CommandPaletteProps { open: boolean; onOpenChange: (value: boolean) => void; onToggleNavigation?: () => void; onToggleContext?: () => void; onResetLayout?: () => void }

export function CommandPalette({ open, onOpenChange, onToggleNavigation, onToggleContext, onResetLayout }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);
  const session = useAuthStore(s => s.session);
  const resolved = useThemeStore(s => s.resolved);
  const setTheme = useThemeStore(s => s.setTheme);
  const close = useCallback(() => { onOpenChange(false); setQuery(''); setActive(0); setError(''); }, [onOpenChange]);
  const commands = useMemo<CommandItem[]>(() => [
    ...routes.map(([path, label, keywords]) => ({ id: path, label, group: 'Navigate' as const, keywords, perform: () => { navigate(path); close(); } })),
    ...([['navigation', 'Toggle navigation panel', onToggleNavigation, <PanelLeft size={16} />], ['context', 'Toggle portfolio panel', onToggleContext, <PanelRight size={16} />], ['reset-layout', 'Reset workspace layout', onResetLayout, <RotateCcw size={16} />]] as const).filter(([, , action]) => action).map(([id, label, action, icon]) => ({ id, label, group: 'Workspace' as const, keywords: 'resize panels workspace layout', icon, perform: () => { close(); action?.(); } })),
    { id: 'theme', label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`, group: 'Appearance', keywords: 'theme dark light mode', icon: resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />, perform: () => { setTheme(resolved === 'dark' ? 'light' : 'dark'); close(); } },
    ...(session ? [{ id: 'logout', label: 'Sign out', group: 'Account' as const, keywords: 'logout exit', icon: <LogOut size={16} />, perform: async () => { await logout(); close(); navigate('/landing'); } }] : []),
  ], [navigate, close, resolved, setTheme, session, logout, onToggleNavigation, onToggleContext, onResetLayout]);
  // The visible order is also the keyboard execution order.
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/);
    const matches = commands.filter(item => terms.every(term => `${item.label} ${item.keywords} ${item.group}`.toLowerCase().includes(term)));
    const text = query.trim();
    const symbols = text.replace(/^\$/, '').toUpperCase().split(/[\s,]+/).filter(Boolean);
    // Only offer a ticker action for ticker-shaped input; the research form confirms scope.
    if (matches.length === 0 && symbols.length <= 4 && symbols.every(symbol => /^[A-Z][A-Z0-9.-]{0,5}$/.test(symbol))) {
      return [{ id: 'research-symbols', label: `Research ${symbols.join(', ')}`, group: 'Research' as const, keywords: '', icon: <Workflow size={16} />, perform: () => { navigate(`/research?symbols=${encodeURIComponent(symbols.join(','))}`); close(); } }];
    }
    if (matches.length === 0 && text.length >= 15 && text.includes(' ')) {
      return [{ id: 'research-question', label: 'Prepare a research question', group: 'Research' as const, keywords: '', icon: <Workflow size={16} />, perform: () => { navigate(`/research?question=${encodeURIComponent(text.slice(0, 1200))}`); close(); } }];
    }
    return matches;
  }, [commands, query, navigate, close]);
  const selected = Math.min(active, Math.max(0, filtered.length - 1));
  const perform = async (item: CommandItem | undefined) => {
    if (!item) return;
    try { await item.perform(); } catch { setError('This action could not be completed. Please try again.'); }
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // Keep one keyboard focus trap active when a drawer or review is open.
        if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        if (open) close(); else onOpenChange(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onOpenChange, close]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, [open]);

  useEffect(() => {
    dialogRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, query]);

  if (!open) return null;
  return <OverlayPortal><div className="workspace-command-overlay" onClick={close}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette" className="workspace-command" onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]):not([tabindex="-1"])');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="workspace-command-search"><Search size={18} aria-hidden="true" />
        <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} aria-label="Command palette search" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="workspace-command-results" aria-activedescendant={filtered[selected] ? `command-${selected}` : undefined} placeholder="Page, action, ticker, or research question…" maxLength={1200} onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, filtered.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); void perform(filtered[selected]); }
        }} />
        <button type="button" className="workspace-icon-button" aria-label="Close search" onClick={close}><X size={18} /></button>
      </div>
      {error && <p role="alert" className="workspace-command-error">{error}</p>}
      <div className="workspace-command-results" role="listbox" id="workspace-command-results" aria-label="Pages and actions">
        {filtered.length === 0 && <p className="workspace-command-empty">No matching pages or actions. Try “portfolio” or “theme”.</p>}
        {filtered.map((item, index) => <div key={item.id}>
          {(index === 0 || item.group !== filtered[index - 1].group) && <p className="workspace-command-group">{item.group}</p>}
          <button type="button" role="option" id={`command-${index}`} aria-selected={index === selected} tabIndex={-1} onClick={() => void perform(item)} onPointerMove={() => setActive(index)}>
            {item.icon || <ArrowUpRight size={16} aria-hidden="true" />}<span>{item.label}</span>{index === selected && <kbd>↵</kbd>}
          </button>
        </div>)}
      </div>
      <div className="workspace-command-footer"><span>↑ ↓ navigate · Enter open</span><span>Esc close</span></div>
    </div>
  </div></OverlayPortal>;
}

export default CommandPalette;
