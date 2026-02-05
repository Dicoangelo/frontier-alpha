import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  ShoppingCart,
  Brain,
  Bell,
} from 'lucide-react';

const mobileNavigation = [
  { name: 'Home', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { name: 'Trade', icon: ShoppingCart, href: '/trade' },
  { name: 'CVRF', icon: Brain, href: '/cvrf' },
  { name: 'Alerts', icon: Bell, href: '/alerts' },
];

export function MobileNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around items-stretch h-16">
        {mobileNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            aria-label={item.name}
            className={({ isActive }) => `
              flex flex-col items-center justify-center
              min-w-[64px] min-h-[56px] px-3 py-2
              touch-manipulation
              transition-all duration-150 ease-out
              active:scale-95 active:bg-gray-100
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset
              ${isActive
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <div
                  className={`
                    relative flex items-center justify-center
                    w-12 h-11 min-h-[44px] rounded-full
                    transition-all duration-200
                    ${isActive ? 'bg-blue-100' : ''}
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                  {isActive && (
                    <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-blue-600" />
                  )}
                </div>
                <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-blue-600' : ''}`}>
                  {item.name}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
