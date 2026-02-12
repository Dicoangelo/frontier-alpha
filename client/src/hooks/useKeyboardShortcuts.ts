import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { announce } from '@/components/shared/VisuallyHidden';

interface KeyboardShortcutsOptions {
  onToggleHelp: () => void;
  onToggleShortcutsModal: () => void;
}

const NAVIGATION_SHORTCUTS: Record<string, { path: string; label: string }> = {
  d: { path: '/dashboard', label: 'Dashboard' },
  f: { path: '/factors', label: 'Factors' },
  c: { path: '/cvrf', label: 'CVRF' },
  e: { path: '/earnings', label: 'Earnings' },
  p: { path: '/portfolio', label: 'Portfolio' },
  t: { path: '/trade', label: 'Trade' },
  o: { path: '/optimize', label: 'Optimize' },
  a: { path: '/alerts', label: 'Alerts' },
  b: { path: '/backtest', label: 'Backtest' },
  m: { path: '/ml', label: 'ML' },
  i: { path: '/options', label: 'Options' },
  l: { path: '/social', label: 'Social' },
  x: { path: '/tax', label: 'Tax' },
  s: { path: '/settings', label: 'Settings' },
};

export const ALL_SHORTCUTS = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'd', description: 'Go to Dashboard' },
  { key: 'f', description: 'Go to Factors' },
  { key: 'c', description: 'Go to CVRF' },
  { key: 'e', description: 'Go to Earnings' },
  { key: 'p', description: 'Go to Portfolio' },
  { key: 't', description: 'Go to Trade' },
  { key: 'o', description: 'Go to Optimize' },
  { key: 'a', description: 'Go to Alerts' },
  { key: 'b', description: 'Go to Backtest' },
  { key: 'm', description: 'Go to ML' },
  { key: 'i', description: 'Go to Options' },
  { key: 'l', description: 'Go to Social' },
  { key: 'x', description: 'Go to Tax' },
  { key: 's', description: 'Go to Settings' },
  { key: 'Esc', description: 'Close modal / panel' },
] as const;

function isInputFocused(): boolean {
  const target = document.activeElement as HTMLElement | null;
  if (!target) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts({ onToggleHelp, onToggleShortcutsModal }: KeyboardShortcutsOptions) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Never intercept shortcuts when user is typing in a form field
      if (isInputFocused()) return;

      // Don't intercept if modifier keys are held (allow Ctrl+C, Cmd+S, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // '?' to toggle shortcuts modal (also opens help panel via useHelpPanel)
      if (e.key === '?') {
        e.preventDefault();
        onToggleShortcutsModal();
        return;
      }

      // Navigation shortcuts
      const nav = NAVIGATION_SHORTCUTS[e.key];
      if (nav) {
        e.preventDefault();
        navigate(nav.path);
        announce(`Navigated to ${nav.label}`);
        return;
      }

      // 'h' for help panel
      if (e.key === 'h') {
        e.preventDefault();
        onToggleHelp();
        return;
      }
    },
    [navigate, onToggleHelp, onToggleShortcutsModal]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
