import { useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  ShoppingCart,
  Sparkles,
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
} from 'lucide-react';

// Route → lazy import map for hover prefetching
const routePrefetchMap: Record<string, () => Promise<unknown>> = {
  '/':         () => import('@/pages/Dashboard'),
  '/portfolio': () => import('@/pages/Portfolio'),
  '/trade':    () => import('@/pages/Trading'),
  '/optimize': () => import('@/pages/Optimize'),
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
      { name: 'Optimize', icon: Sparkles, href: '/optimize' },
      { name: 'Options', icon: Sigma, href: '/options' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
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
}

export function Sidebar({ onNavigate }: SidebarProps) {
  // Prefetch route chunk on hover (fires import() which Vite caches)
  const handlePrefetch = useCallback((href: string) => {
    const prefetch = routePrefetchMap[href];
    if (prefetch) prefetch();
  }, []);

  return (
    // `flex flex-col` keeps the DQ Score footer pinned below the nav in the
    // normal flow; previously it was `absolute bottom-0` and overlapped the
    // bottom Account links once the nav grew tall enough (e.g. after the
    // v1.2.6 Backtest entry was added).
    <aside className="fixed left-0 top-16 bottom-0 w-64 glass-slab overflow-y-auto flex flex-col">
      <nav className="p-4 space-y-6 flex-1">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <p className="px-4 pb-1 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              {section.label}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                onClick={onNavigate}
                onPointerEnter={() => handlePrefetch(item.href)}
                className={({ isActive }: { isActive: boolean }) => `
                  relative flex items-center gap-3 px-4 py-3 rounded-sm
                  transition-[background-color,color] duration-200 animate-press
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset
                  before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full
                  ${isActive
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-text)] font-medium before:bg-[image:var(--gradient-sovereign)]'
                    : 'text-theme-secondary hover:bg-[var(--color-bg-tertiary)] hover:text-theme before:bg-transparent'
                  }
                `}
              >
                <item.icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-sm">{item.name}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-theme glass-slab">
        <div className="p-3 rounded-sm bg-[image:var(--gradient-sovereign)] text-white animate-press animate-lift shadow-[0_4px_20px_rgba(123,44,255,0.3)] hover:brightness-110 transition-[filter] duration-200 cursor-default">
          <p className="text-[10px] font-bold mono tracking-[0.3em] uppercase">DQ Score: 0.88</p>
          <p className="text-[10px] mono mt-1 opacity-80">Powered by 80+ factors</p>
        </div>
      </div>
    </aside>
  );
}
