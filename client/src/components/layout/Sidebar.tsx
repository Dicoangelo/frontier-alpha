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
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { name: 'Trade', icon: ShoppingCart, href: '/trade' },
  { name: 'Optimize', icon: Sparkles, href: '/optimize' },
  { name: 'Factors', icon: BarChart3, href: '/factors' },
  { name: 'Earnings', icon: Calendar, href: '/earnings' },
  { name: 'Alerts', icon: Bell, href: '/alerts' },
  { name: 'CVRF', icon: Brain, href: '/cvrf' },
  { name: 'ML', icon: Cpu, href: '/ml' },
  { name: 'Options', icon: Sigma, href: '/options' },
  { name: 'Social', icon: Users, href: '/social' },
  { name: 'Tax', icon: Receipt, href: '/tax' },
  { name: 'Settings', icon: Settings, href: '/settings' },
  { name: 'Help', icon: HelpCircle, href: '/help' },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 glass-slab overflow-y-auto">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-sm transition-all click-feedback
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset
              ${isActive
                ? 'gradient-brand-subtle text-accent font-medium'
                : 'text-theme-secondary hover:bg-theme-tertiary'
              }
            `}
          >
            <item.icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-theme">
        <div className="p-3 gradient-brand-subtle rounded-sm">
          <p className="text-[10px] text-accent font-bold mono tracking-[0.3em] uppercase">DQ Score: 0.88</p>
          <p className="text-[10px] text-theme-muted mono mt-1">Powered by 80+ factors</p>
        </div>
      </div>
    </aside>
  );
}
