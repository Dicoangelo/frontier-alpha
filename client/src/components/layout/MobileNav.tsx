import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  ShoppingCart,
  Brain,
  MoreHorizontal,
  BarChart3,
  Calendar,
  Sparkles,
  Cpu,
  Sigma,
  Users,
  Receipt,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { useState } from 'react';
import { BottomSheet } from '@/components/shared/BottomSheet';

const mobileNavigation = [
  { name: 'Home', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { name: 'Trade', icon: ShoppingCart, href: '/trade' },
  { name: 'CVRF', icon: Brain, href: '/cvrf' },
];

const morePages = [
  { name: 'Factors', icon: BarChart3, href: '/factors' },
  { name: 'Earnings', icon: Calendar, href: '/earnings' },
  { name: 'Optimize', icon: Sparkles, href: '/optimize' },
  { name: 'ML', icon: Cpu, href: '/ml' },
  { name: 'Options', icon: Sigma, href: '/options' },
  { name: 'Tax', icon: Receipt, href: '/tax' },
  { name: 'Social', icon: Users, href: '/social' },
  { name: 'Settings', icon: Settings, href: '/settings' },
  { name: 'Help', icon: HelpCircle, href: '/help' },
];

function navButtonClass(isActive: boolean) {
  return `
    flex flex-col items-center justify-center
    min-w-[64px] min-h-[56px] px-3 py-2
    touch-manipulation
    transition-all duration-150 ease-out
    active:scale-95 click-feedback
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset
    ${isActive ? 'text-accent' : 'text-theme-muted hover:text-theme-secondary'}
  `;
}

function NavButtonContent({ icon: Icon, label, isActive }: { icon: React.ElementType; label: string; isActive: boolean }) {
  return (
    <>
      <div
        className={`
          relative flex items-center justify-center
          w-12 h-11 min-h-[44px] rounded-sm
          transition-all duration-200
          ${isActive ? 'bg-accent-light' : ''}
        `}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
        {isActive && (
          <span className="absolute -bottom-1 w-4 h-[2px] gradient-brand rounded-full" />
        )}
      </div>
      <span className={`text-[9px] mt-0.5 mono tracking-[0.15em] uppercase ${isActive ? 'text-accent' : ''}`}>
        {label}
      </span>
    </>
  );
}

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isMoreActive = morePages.some((p) => location.pathname === p.href);

  return (
    <>
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
              className={({ isActive }) => navButtonClass(isActive)}
            >
              {({ isActive }) => (
                <NavButtonContent icon={item.icon} label={item.name} isActive={isActive} />
              )}
            </NavLink>
          ))}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More pages"
            className={navButtonClass(isMoreActive)}
          >
            <NavButtonContent icon={MoreHorizontal} label="More" isActive={isMoreActive} />
          </button>
        </div>
      </nav>

      <BottomSheet
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
      >
        <div className="space-y-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
          {morePages.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.href);
                  setMoreOpen(false);
                }}
                className={`
                  w-full flex items-center gap-4 px-4 py-3
                  min-h-[48px] rounded-lg
                  touch-manipulation transition-colors
                  ${isActive
                    ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-accent'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                  }
                `}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.name}</span>
                {isActive && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
