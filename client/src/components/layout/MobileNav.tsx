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
      className="lg:hidden fixed bottom-0 left-0 right-0 glass-slab-floating z-30"
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
              active:scale-95 click-feedback
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset
              ${isActive
                ? 'text-accent'
                : 'text-theme-muted hover:text-theme-secondary'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <div
                  className={`
                    relative flex items-center justify-center
                    w-12 h-11 min-h-[44px] rounded-sm
                    transition-all duration-200
                    ${isActive ? 'bg-accent-light' : ''}
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                  {isActive && (
                    <span className="absolute -bottom-1 w-4 h-[2px] gradient-brand rounded-full" />
                  )}
                </div>
                <span className={`text-[9px] mt-0.5 mono tracking-[0.15em] uppercase ${isActive ? 'text-accent' : ''}`}>
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
