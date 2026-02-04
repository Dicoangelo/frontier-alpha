import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Sparkles,
  Bell,
  Settings,
} from 'lucide-react';

const mobileNavigation = [
  { name: 'Home', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { name: 'Optimize', icon: Sparkles, href: '/optimize' },
  { name: 'Alerts', icon: Bell, href: '/alerts' },
  { name: 'Settings', icon: Settings, href: '/settings' },
];

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30 safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16">
        {mobileNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) => `
              flex flex-col items-center justify-center px-3 py-2 transition-colors
              ${isActive
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-xs mt-1">{item.name}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
