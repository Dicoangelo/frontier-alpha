import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { PanelResizeHandle } from './PanelResizeHandle';
import { SkipToMain } from '@/components/shared/VisuallyHidden';
import { HelpPanel, useHelpPanel } from '@/components/help';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { MockDataBanner } from '@/components/shared/MockDataBanner';
import { KeyboardHelpModal } from '@/components/shared/KeyboardHelpModal';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { PageTransition } from '@/components/shared/PageTransition';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAuthStore } from '@/stores/authStore';
import './workspace.css';

const NAV_MIN = 216;
const NAV_MAX = 336;
const NAV_DEFAULT = 248;
const LAYOUT_KEY = 'frontier-workspace-layout';

function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    return {
      width: typeof saved?.width === 'number' && Number.isFinite(saved.width)
        ? Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(saved.width))) : NAV_DEFAULT,
      collapsed: saved?.collapsed === true,
    };
  } catch {
    return { width: NAV_DEFAULT, collapsed: false };
  }
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [layout, setLayout] = useState(readLayout);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { isOpen: helpOpen, openHelp, closeHelp, toggleHelp, initialTopic } = useHelpPanel();
  const session = useAuthStore((state) => state.session);
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* Resizing works without storage. */ }
  }, [layout]);

  const handleToggleShortcutsModal = useCallback(() => {
    setShortcutsOpen((prev) => !prev);
  }, []);

  useKeyboardShortcuts({ onToggleHelp: toggleHelp, onToggleShortcutsModal: handleToggleShortcutsModal });

  useEffect(() => {
    if (!sidebarOpen) return;
    const drawer = drawerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer?.querySelector<HTMLElement>('button, a[href]')?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSidebarOpen(false);
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSidebarOpen(false); };
    document.addEventListener('keydown', handleKey, true);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey, true);
      desktop.removeEventListener('change', closeOnDesktop);
      previousFocus?.focus();
    };
  }, [sidebarOpen]);

  return (
    <div
      className={`workspace-shell${session ? '' : ' is-demo'}`}
      style={{ '--workspace-nav-width': `${layout.collapsed ? 72 : layout.width}px` } as CSSProperties}
    >
      <SkipToMain />
      <div inert={sidebarOpen || undefined}>
        <Header onMenuClick={() => setSidebarOpen(true)} onHelpClick={() => openHelp()} sidebarOpen={sidebarOpen} />
        <ConnectionStatus />
        <aside className="workspace-desktop-nav" aria-label="Main navigation">
          <Sidebar collapsed={layout.collapsed} onToggle={() => setLayout((state) => ({ ...state, collapsed: !state.collapsed }))} />
          {!layout.collapsed && (
            <PanelResizeHandle
              value={layout.width}
              onChange={(width) => setLayout((state) => ({ ...state, width }))}
              min={NAV_MIN}
              max={NAV_MAX}
              defaultValue={NAV_DEFAULT}
            />
          )}
        </aside>
        <main id="main-content" className="workspace-main" role="main" tabIndex={-1}>
          <div className="workspace-data-notice"><MockDataBanner /></div>
          <PageTransition>{children}</PageTransition>
        </main>
        <MobileNav />
      </div>

      {sidebarOpen && (
        <div className="workspace-mobile-overlay" role="dialog" aria-modal="true" aria-label="Navigation menu" ref={drawerRef}>
          <div className="workspace-mobile-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <div className="workspace-mobile-drawer">
            <div className="workspace-drawer-header">
              <span>Frontier Alpha</span>
              <button type="button" className="workspace-icon-button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
            </div>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
      <HelpPanel isOpen={helpOpen} onClose={closeHelp} initialTopic={initialTopic} />
      <KeyboardHelpModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette />
    </div>
  );
}
