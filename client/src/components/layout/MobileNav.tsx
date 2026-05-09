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
  LineChart,
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
  { name: 'Backtest', icon: LineChart, href: '/backtest' },
  { name: 'Options', icon: Sigma, href: '/options' },
  { name: 'Tax', icon: Receipt, href: '/tax' },
  { name: 'Social', icon: Users, href: '/social' },
  { name: 'Settings', icon: Settings, href: '/settings' },
  { name: 'Help', icon: HelpCircle, href: '/help' },
];

function navButtonClass(isActive: boolean) {
  return `
    relative flex flex-col items-center justify-center gap-1
    flex-1 min-h-[56px] py-2
    touch-manipulation animate-press
    transition-colors duration-200
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset
    before:content-[''] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2
    before:h-[3px] before:w-8 before:rounded-full
    ${isActive
      ? 'text-[var(--color-accent)] before:bg-[image:var(--gradient-sovereign)]'
      : 'text-theme-secondary hover:text-theme before:bg-transparent'
    }
  `;
}

function NavButtonContent({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <>
      <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
      <span className="mono text-[10px] tracking-[0.15em] uppercase">{label}</span>
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
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden glass-slab-floating border-t border-theme"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch">
          {mobileNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              aria-label={item.name}
              className={({ isActive }) => navButtonClass(isActive)}
            >
              {() => <NavButtonContent icon={item.icon} label={item.name} />}
            </NavLink>
          ))}

          {/* More button */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More pages"
            aria-expanded={moreOpen}
            className={navButtonClass(isMoreActive)}
          >
            <NavButtonContent icon={MoreHorizontal} label="More" />
          </button>
        </div>
      </nav>

      <BottomSheet
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
      >
        <div
          className="space-y-1"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        >
          {morePages.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  navigate(item.href);
                  setMoreOpen(false);
                }}
                className={`
                  w-full flex items-center gap-4 px-4 py-3
                  min-h-[48px] rounded-sm
                  touch-manipulation animate-press
                  transition-colors duration-200
                  ${isActive
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'text-theme-secondary hover:bg-[var(--color-bg-tertiary)] hover:text-theme'
                  }
                `}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
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
