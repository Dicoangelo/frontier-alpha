import { useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BrandLogo } from '@/components/shared/BrandLogo';
import {
  Workflow,
  LayoutDashboard,
  Briefcase,
  ShoppingCart,
  SlidersHorizontal,
  BarChart3,
  Calendar,
  Bell,
  Settings,
  HelpCircle,
  Brain,
  Cpu,
  Sigma,
  Users,
  Receipt,
  LineChart,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

// Route → lazy import map for hover prefetching
const routePrefetchMap: Record<string, () => Promise<unknown>> = {
  '/':         () => import('@/pages/Dashboard'),
  '/portfolio': () => import('@/pages/Portfolio'),
  '/trade':    () => import('@/pages/Trading'),
  '/optimize': () => import('@/pages/Optimize'),
  '/research': () => import('@/pages/AgentResearch'),
  '/factors':  () => import('@/pages/Factors'),
  '/earnings': () => import('@/pages/Earnings'),
  '/alerts':   () => import('@/pages/Alerts'),
  '/cvrf':     () => import('@/pages/CVRF'),
  '/ml':       () => import('@/pages/ML'),
  '/backtest': () => import('@/pages/Backtest'),
  '/options':  () => import('@/pages/Options'),
  '/insights': () => import('@/pages/InsightHistory'),
  '/social':   () => import('@/pages/Social'),
  '/tax':      () => import('@/pages/Tax'),
  '/settings': () => import('@/pages/Settings'),
  '/help':     () => import('@/pages/Help'),
};

type NavItem = {
  name: string;
  icon: typeof LayoutDashboard;
  href: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
      { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
    ],
  },
  {
    label: 'Execution',
    items: [
      { name: 'Trade', icon: ShoppingCart, href: '/trade' },
      { name: 'Optimize', icon: SlidersHorizontal, href: '/optimize' },
      { name: 'Options', icon: Sigma, href: '/options' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { name: 'Agent research', icon: Workflow, href: '/research' },
      { name: 'Factors', icon: BarChart3, href: '/factors' },
      { name: 'CVRF', icon: Brain, href: '/cvrf' },
      { name: 'ML', icon: Cpu, href: '/ml' },
      { name: 'Backtest', icon: LineChart, href: '/backtest' },
      { name: 'Insights', icon: ScrollText, href: '/insights' },
      { name: 'Earnings', icon: Calendar, href: '/earnings' },
      { name: 'Social', icon: Users, href: '/social' },
    ],
  },
  {
    label: 'Account',
    items: [
      { name: 'Alerts', icon: Bell, href: '/alerts' },
      { name: 'Tax', icon: Receipt, href: '/tax' },
      { name: 'Settings', icon: Settings, href: '/settings' },
      { name: 'Help', icon: HelpCircle, href: '/help' },
    ],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ onNavigate, collapsed = false, onToggle }: SidebarProps) {
  const location = useLocation();
  const handlePrefetch = useCallback((href: string) => {
    const prefetch = routePrefetchMap[href];
    if (prefetch) prefetch();
  }, []);

  return (
    <div className={`workspace-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="workspace-sidebar-heading fa-brand-sidebar-heading">
        <div className="fa-brand-sidebar"><BrandLogo variant="wordmark" /><strong>Frontier Alpha</strong></div>
        {onToggle && (
          <button
            type="button"
            className="workspace-icon-button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
      </div>
      <nav className="workspace-navigation" aria-label="Workspace views">
        {navSections.map((section) => (
          <div key={section.label} className="workspace-nav-section">
            <p className="workspace-nav-heading">{section.label}</p>
            {section.items.map((item) => (
              <NavLink
                key={item.name}
                to={item.href === '/' && location.pathname === '/dashboard' ? '/dashboard' : item.href}
                end={item.href === '/'}
                onClick={onNavigate}
                onPointerEnter={() => handlePrefetch(item.href)}
                onFocus={() => handlePrefetch(item.href)}
                aria-label={item.name}
                title={collapsed ? item.name : undefined}
                className={({ isActive }) => `workspace-nav-link${isActive ? ' is-active' : ''}`}
              >
                <item.icon size={18} aria-hidden="true" />
                <span className="workspace-nav-label">{item.name}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="workspace-sidebar-footer">
        <LineChart size={18} aria-hidden="true" />
        <div>
          <p>Portfolio workspace</p>
          <span>Research. Review. Invest.</span>
        </div>
      </div>
    </div>
  );
}
