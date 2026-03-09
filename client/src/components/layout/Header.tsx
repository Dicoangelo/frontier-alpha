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
            className="lg:hidden p-2 -ml-2 text-theme-secondary hover:text-accent click-feedback rounded-sm"
            aria-label="Toggle navigation"
          >
            <Menu className="w-6 h-6" />
          </button>

          <Link to="/" className="flex items-center gap-3">
            <img
              src="/metaventions-logo.png"
              alt="Metaventions AI"
              className="w-10 h-10 rounded-sm"
            />
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-theme">
                Frontier <span className="text-gradient-brand">Alpha</span>
              </h1>
              <p className="text-[10px] text-theme-muted mono tracking-[0.3em] uppercase">by Metaventions AI</p>
            </div>
          </Link>

          {/* Mobile page title */}
          {pageTitle && (
            <span className="lg:hidden text-sm font-semibold text-theme mono tracking-[0.1em] uppercase">
              {pageTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2" role="status" aria-label="Live connection active">
            <div className="w-2 h-2 bg-[#00FFC6] rounded-full animate-pulse-green shadow-[0_0_8px_#00FFC6]" aria-hidden="true" />
            <span className="text-[10px] text-[#00FFC6] mono tracking-[0.3em] uppercase hidden sm:inline" aria-hidden="true">Live</span>
          </div>

          <AlertDropdown />

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="p-2 text-theme-secondary hover:text-accent click-feedback rounded-sm"
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
            title={`${resolved === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Help button with keyboard hint */}
          <HelpKeyboardHint />
          <button
            onClick={onHelpClick}
            className="p-2 text-theme-secondary hover:text-accent click-feedback rounded-sm"
            aria-label="Open help (press ? key)"
            title="Help (press ?)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className="hidden lg:flex p-2 text-theme-secondary hover:text-theme click-feedback rounded-sm"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
