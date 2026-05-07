import { Link, useLocation } from 'react-router-dom';
import { Settings, Menu, HelpCircle, Moon, Sun } from 'lucide-react';
import { AlertDropdown } from '@/components/alerts/AlertDropdown';
import { HelpKeyboardHint } from '@/components/help';
import { useThemeStore } from '@/stores/themeStore';

const pageTitleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/portfolio': 'Portfolio',
  '/trade': 'Trade',
  '/optimize': 'Optimize',
  '/factors': 'Factors',
  '/earnings': 'Earnings',
  '/alerts': 'Alerts',
  '/cvrf': 'CVRF',
  '/ml': 'ML',
  '/options': 'Options',
  '/social': 'Social',
  '/tax': 'Tax',
  '/settings': 'Settings',
  '/help': 'Help',
};

interface HeaderProps {
  onMenuClick?: () => void;
  onHelpClick?: () => void;
}

export function Header({ onMenuClick, onHelpClick }: HeaderProps) {
  const { resolved, toggle } = useThemeStore();
  const location = useLocation();
  const pageTitle = pageTitleMap[location.pathname] || '';

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-slab-floating z-50">
      {/* Sovereign spectrum top bar */}
      <div className="sovereign-bar absolute top-0 left-0 right-0" />

      <div className="flex items-center justify-between h-full px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-theme-secondary hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Toggle navigation"
          >
            <Menu className="w-6 h-6" />
          </button>

          <Link
            to="/"
            className="flex items-center gap-3 animate-press rounded-sm transition-[color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <img
              src="/metaventions-logo.png"
              alt="Metaventions AI"
              width={40}
              height={40}
              loading="eager"
              decoding="async"
              className="w-10 h-10 rounded-sm"
            />
            <div className="hidden sm:flex flex-col leading-tight">
              <h1 className="mono text-base font-bold tracking-[0.18em] uppercase text-theme">
                FRONTIER <span className="text-gradient-brand">ALPHA</span>
              </h1>
              <p className="hidden md:block text-[9px] text-theme-muted mono tracking-[0.4em] uppercase mt-0.5">
                by Metaventions AI
              </p>
            </div>
          </Link>

          {/* Page title kicker (desktop) */}
          {pageTitle && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-4 border-l border-theme">
              <span
                className="w-1 h-1 rounded-full bg-[var(--color-accent)]"
                aria-hidden="true"
              />
              <span className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted holo-pulse">
                {pageTitle}
              </span>
            </div>
          )}

          {/* Mobile page title */}
          {pageTitle && (
            <span className="lg:hidden mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              {pageTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full glass-slab"
            role="status"
            aria-label="Live connection active"
          >
            <div
              className="w-1.5 h-1.5 bg-[var(--color-brand-teal)] rounded-full animate-pulse-green shadow-[0_0_8px_var(--color-brand-teal)]"
              aria-hidden="true"
            />
            <span
              className="text-[9px] text-[var(--color-brand-teal)] mono tracking-[0.4em] uppercase"
              aria-hidden="true"
            >
              Live
            </span>
          </div>

          <AlertDropdown />

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="p-2 text-theme-secondary hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
            title={`${resolved === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Help button with keyboard hint */}
          <HelpKeyboardHint />
          <button
            onClick={onHelpClick}
            className="p-2 text-theme-secondary hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Open help (press ? key)"
            title="Help (press ?)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className="hidden lg:flex p-2 text-theme-secondary hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] animate-press rounded-sm transition-[color,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
