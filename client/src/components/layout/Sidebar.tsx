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
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { name: 'Trade', icon: ShoppingCart, href: '/trade' },
  { name: 'Optimize', icon: Sparkles, href: '/optimize' },
  { name: 'Factors', icon: BarChart3, href: '/factors' },
  { name: 'Earnings', icon: Calendar, href: '/earnings' },
  { name: 'Alerts', icon: Bell, href: '/alerts' },
  { name: 'Settings', icon: Settings, href: '/settings' },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r overflow-y-auto">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-lg transition
              ${isActive
                ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white">
        <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
          <p className="text-xs text-blue-800 font-medium">DQ Score: 0.88</p>
          <p className="text-xs text-gray-500 mt-1">Powered by 80+ factors</p>
        </div>
      </div>
    </aside>
  );
}
