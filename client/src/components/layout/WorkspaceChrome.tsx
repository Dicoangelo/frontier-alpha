import { Link, NavLink, useLocation } from 'react-router-dom';
import { Search, LayoutDashboard, Briefcase, ArrowLeftRight, BarChart3, HelpCircle, Settings, LineChart, ArrowUpRight, CalendarDays, Bell, PanelLeftOpen } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useFeedStatus } from '@/hooks/useFeedStatus';
import { DEMO_HOLDINGS } from '@/lib/demoFixtures';

export function ApplicationRail({ onSearch, onHelp, collapsed, onExpand }: { onSearch: () => void; onHelp: () => void; collapsed: boolean; onExpand: () => void }) {
  const { pathname } = useLocation();
  return <aside className="workspace-app-rail" aria-label="Application rail">
    <Link to="/" className="workspace-rail-logo" aria-label="Frontier Alpha dashboard"><LineChart size={22} /></Link>
    {collapsed && <button type="button" onClick={onExpand} aria-label="Expand navigation" title="Expand navigation"><PanelLeftOpen size={19} /></button>}
    <button type="button" onClick={onSearch} aria-label="Search workspace" title="Search (⌘ K)"><Search size={19} /></button>
    <NavLink to={pathname === '/dashboard' ? '/dashboard' : '/'} end aria-label="Open dashboard" title="Dashboard"><LayoutDashboard size={19} /></NavLink>
    <NavLink to="/portfolio" aria-label="Open holdings" title="Holdings"><Briefcase size={19} /></NavLink>
    <NavLink to="/trade" aria-label="Open trading" title="Trade"><ArrowLeftRight size={19} /></NavLink>
    <NavLink to="/factors" aria-label="Open factor research" title="Factors"><BarChart3 size={19} /></NavLink>
    <div className="workspace-rail-bottom"><button type="button" onClick={onHelp} aria-label="Open workspace help" title="Help"><HelpCircle size={19} /></button><Link to="/settings" aria-label="Open workspace settings" title="Settings"><Settings size={19} /></Link><span className="workspace-rail-monogram">FA</span></div>
  </aside>;
}

const overview = [['/', 'Overview'], ['/portfolio', 'Holdings'], ['/factors', 'Factors'], ['/earnings', 'Earnings']];
const execution = [['/portfolio', 'Holdings'], ['/trade', 'Trade'], ['/optimize', 'Optimize'], ['/options', 'Options']];
const research = [['/factors', 'Factors'], ['/cvrf', 'Beliefs'], ['/ml', 'Models'], ['/insights', 'Insights'], ['/backtest', 'Backtest'], ['/earnings', 'Earnings']];
const account = [['/alerts', 'Alerts'], ['/tax', 'Tax'], ['/social', 'Community'], ['/settings', 'Settings'], ['/help', 'Help']];

export function WorkspaceTabs() {
  const { pathname } = useLocation();
  const group = execution.some(([path]) => path === pathname) ? execution : research.some(([path]) => path === pathname) ? research : account.some(([path]) => path === pathname) ? account : overview;
  return <nav className="workspace-view-tabs" aria-label="Related workspace views">{group.map(([path, label]) => <NavLink key={path} to={path === '/' && pathname === '/dashboard' ? '/dashboard' : path} end>{label}</NavLink>)}</nav>;
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
