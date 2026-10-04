import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Briefcase, ArrowLeftRight, BarChart3, HelpCircle, Settings, ArrowUpRight, CalendarDays, Bell, PanelLeftOpen, Bot, Plus, X, Pin } from 'lucide-react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { useAuthStore } from '@/stores/authStore';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useFeedStatus } from '@/hooks/useFeedStatus';
import { DEMO_HOLDINGS } from '@/lib/demoFixtures';
import './workspace-tabs.css';

export function ApplicationRail({ onSearch, onHelp, collapsed, onExpand }: { onSearch: () => void; onHelp: () => void; collapsed: boolean; onExpand: () => void }) {
  const { pathname } = useLocation();
  return <aside className="workspace-app-rail" aria-label="Application rail">
    <Link to="/" className="workspace-rail-logo" aria-label="Frontier Alpha dashboard"><BrandLogo decorative /></Link>
    {collapsed && <button type="button" onClick={onExpand} aria-label="Expand navigation" title="Expand navigation"><PanelLeftOpen size={19} /></button>}
    <button type="button" onClick={onSearch} aria-label="Search workspace" title="Search (⌘ K)"><Search size={19} /></button>
    <NavLink to={pathname === '/dashboard' ? '/dashboard' : '/'} end aria-label="Open dashboard" title="Dashboard"><LayoutDashboard size={19} /></NavLink>
    <NavLink to="/portfolio" aria-label="Open holdings" title="Holdings"><Briefcase size={19} /></NavLink>
    <NavLink to="/trade" aria-label="Open trading" title="Trade"><ArrowLeftRight size={19} /></NavLink>
    <NavLink to="/factors" aria-label="Open factor research" title="Factors"><BarChart3 size={19} /></NavLink>
    <NavLink to="/research" aria-label="Open agent research" title="Agent research"><Bot size={19} /></NavLink>
    <div className="workspace-rail-bottom"><button type="button" onClick={onHelp} aria-label="Open workspace help" title="Help"><HelpCircle size={19} /></button><Link to="/settings" aria-label="Open workspace settings" title="Settings"><Settings size={19} /></Link><span className="workspace-rail-monogram">FA</span></div>
  </aside>;
}

const WORKSPACE_TABS_KEY = 'frontier-workspace-tabs-v1';
const MAX_WORKSPACE_TABS = 8;
const WORKSPACE_ROUTES: Record<string, string> = {
  '/': 'Overview', '/portfolio': 'Holdings', '/trade': 'Trade', '/optimize': 'Optimize',
  '/options': 'Options', '/factors': 'Factors', '/research': 'Agent research',
  '/cvrf': 'Beliefs', '/ml': 'Models', '/insights': 'Insights', '/backtest': 'Backtest',
  '/earnings': 'Earnings', '/alerts': 'Alerts', '/tax': 'Tax', '/social': 'Community',
  '/settings': 'Settings', '/help': 'Help',
};

// Persist only known route paths. Never retain symbols, search queries, hashes,
// account identifiers, or arbitrary URLs from location or local storage.
function workspacePath(pathname: string): string | null {
  const path = pathname === '/dashboard' ? '/' : pathname;
  return Object.hasOwn(WORKSPACE_ROUTES, path) ? path : null;
}

function openWorkspacePath(paths: string[], currentPath: string | null): string[] {
  if (!currentPath || paths.includes(currentPath)) return paths;
  const otherPaths = [...paths.filter(path => path !== '/'), currentPath];
  return ['/', ...otherPaths.slice(-(MAX_WORKSPACE_TABS - 1))];
}

function readWorkspacePaths(currentPath: string | null): string[] {
  let saved: string[] = [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WORKSPACE_TABS_KEY) ?? '[]');
    if (Array.isArray(value)) saved = value.flatMap(path => {
      const safePath = typeof path === 'string' ? workspacePath(path) : null;
      return safePath && safePath !== '/' ? [safePath] : [];
    });
  } catch { /* Storage can be blocked or contain an older invalid value. */ }
  return openWorkspacePath(['/', ...Array.from(new Set(saved)).slice(-(MAX_WORKSPACE_TABS - 1))], currentPath);
}

function persistWorkspacePaths(paths: string[]) {
  try { localStorage.setItem(WORKSPACE_TABS_KEY, JSON.stringify(paths)); }
  catch { /* Navigation still works when persistence is unavailable. */ }
}

export function WorkspaceTabs({ onSearch }: { onSearch?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentPath = workspacePath(pathname);
  const [tabs, setTabs] = useState(() => ({ paths: readWorkspacePaths(currentPath), visitedPath: currentPath }));
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const pendingFocus = useRef<string | null>(null);

  // Track route transitions without re-opening a tab while its close action is
  // waiting for router navigation. Revisiting an open route keeps tab order.
  if (tabs.visitedPath !== currentPath) {
    setTabs({ paths: openWorkspacePath(tabs.paths, currentPath), visitedPath: currentPath });
  }

  useEffect(() => {
    persistWorkspacePaths(tabs.paths);
  }, [tabs.paths]);

  useEffect(() => {
    const focusPath = pendingFocus.current;
    if (focusPath) {
      links.current.get(focusPath)?.focus();
      pendingFocus.current = null;
    }
    const visiblePath = focusPath ?? currentPath;
    if (visiblePath) links.current.get(visiblePath)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tabs.paths, currentPath]);

  const closeTab = (path: string) => {
    if (path === '/') return;
    const index = tabs.paths.indexOf(path);
    const remaining = tabs.paths.filter(openPath => openPath !== path);
    const neighbor = remaining[Math.max(0, index - 1)] ?? '/';
    pendingFocus.current = neighbor;
    setTabs({ ...tabs, paths: remaining });
    // Commit the close before navigation can unmount this route's layout.
    persistWorkspacePaths(remaining);
    if (path === currentPath) navigate(neighbor);
  };

  return <nav className="workspace-view-tabs workspace-persistent-tabs" aria-label="Workspace tabs">
    <div className="workspace-tabs-list">
      {tabs.paths.map(path => <div key={path} className={`workspace-route-tab${path === currentPath ? ' is-active' : ''}`}>
        <NavLink
          to={path === '/' && pathname === '/dashboard' ? '/dashboard' : path}
          end
          ref={element => { if (element) links.current.set(path, element); else links.current.delete(path); }}
          title={path === '/' ? 'Overview (pinned)' : WORKSPACE_ROUTES[path]}
        >
          {path === '/' && <Pin size={12} aria-hidden="true" />}
          {WORKSPACE_ROUTES[path]}
        </NavLink>
        {path !== '/' && <button type="button" className="workspace-tab-close" aria-label={`Close ${WORKSPACE_ROUTES[path]}`} title={`Close ${WORKSPACE_ROUTES[path]}`} onClick={() => closeTab(path)}><X size={13} aria-hidden="true" /></button>}
      </div>)}
    </div>
    {onSearch && <button type="button" className="workspace-tab-add" onClick={onSearch} aria-label="Open a workspace view" title="Open a workspace view (⌘ K)"><Plus size={17} aria-hidden="true" /></button>}
  </nav>;
}

export function PortfolioContext({ onNavigate }: { onNavigate?: () => void }) {
  const session = useAuthStore(state => state.session);
  const { data, isLoading, isError, refetch } = usePortfolio();
  const feed = useFeedStatus();
  const positions = session ? data?.positions ?? [] : DEMO_HOLDINGS;
  return <div className="workspace-context-body">
    <section><p className="workspace-context-label">{session ? 'Saved holdings' : 'Sample holdings'}</p><div className="workspace-context-metric">{session && (isLoading || isError) ? '—' : positions.length}<span>positions</span></div>
      <p className="workspace-context-description">{session ? 'Your saved positions, ready for review.' : 'Illustrative portfolio. Sign in to manage your own holdings.'}</p>
      {isError && <button type="button" className="workspace-context-link" onClick={() => void refetch()}>Reload portfolio</button>}
      <Link to="/portfolio" onClick={onNavigate} className="workspace-context-link">Review holdings <ArrowUpRight size={14} /></Link>
    </section>
    <section><p className="workspace-context-label">In your workspace</p>
      {positions.slice(0, 6).map(position => <Link to={`/trade?symbol=${encodeURIComponent(position.symbol)}`} onClick={onNavigate} className="workspace-context-position" key={position.symbol}><span>{position.symbol}</span><small>{position.shares.toLocaleString()} shares</small><ArrowUpRight size={13} /></Link>)}
      {!isLoading && positions.length === 0 && <p className="workspace-context-description">Add holdings to start your portfolio review.</p>}
    </section>
    <section><p className="workspace-context-label">Research tools</p>
      <Link to="/research" onClick={onNavigate} className="workspace-context-action"><Bot size={16} /><span>Agent research<small>Investigate an investment question</small></span><ArrowUpRight size={14} /></Link>
      <Link to="/factors" onClick={onNavigate} className="workspace-context-action"><BarChart3 size={16} /><span>Factor exposures<small>Understand portfolio drivers</small></span><ArrowUpRight size={14} /></Link>
      <Link to="/earnings" onClick={onNavigate} className="workspace-context-action"><CalendarDays size={16} /><span>Earnings calendar<small>Review upcoming reports</small></span><ArrowUpRight size={14} /></Link>
      <Link to="/alerts" onClick={onNavigate} className="workspace-context-action"><Bell size={16} /><span>Risk alerts<small>Track what needs attention</small></span><ArrowUpRight size={14} /></Link>
    </section>
    <div className="workspace-context-feed"><span className="workspace-status-dot" /><strong>{feed.label} quotes</strong><p>{feed.aria}</p></div>
  </div>;
}

export function WorkspaceStatus() {
  const session = useAuthStore(state => state.session);
  const feed = useFeedStatus();
  return <footer className="workspace-statusbar"><span><i />{session ? 'Portfolio workspace' : 'Demo portfolio'}</span><span className="workspace-status-hint">Drag panel edges to resize · Double-click to reset</span><span className="workspace-status-end">{feed.label} quotes · USD</span></footer>;
}
