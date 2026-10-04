import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { ApplicationRail, WorkspaceTabs, PortfolioContext, WorkspaceStatus } from './WorkspaceChrome';
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
const NAV_DEFAULT = 236;
const LAYOUT_KEY = 'frontier-workspace-layout';

function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    return {
      width: typeof saved?.width === 'number' && Number.isFinite(saved.width)
        ? Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(saved.width))) : NAV_DEFAULT,
      collapsed: saved?.collapsed === true,
      contextWidth: typeof saved?.contextWidth === 'number' && Number.isFinite(saved.contextWidth) ? Math.min(340, Math.max(228, saved.contextWidth)) : 252,
      contextHidden: saved?.contextHidden === true,
    };
  } catch {
    return { width: NAV_DEFAULT, collapsed: false, contextWidth: 252, contextHidden: false };
  }
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1600px)').matches);
  const [layout, setLayout] = useState(readLayout);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { isOpen: helpOpen, openHelp, closeHelp, toggleHelp, initialTopic } = useHelpPanel();
  const session = useAuthStore((state) => state.session);
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const drawerOpen = sidebarOpen || contextOpen;
  const showContext = wide && !layout.contextHidden;
  const toggleContext = () => { if (wide) setLayout(state => ({ ...state, contextHidden: !state.contextHidden })); else setContextOpen(true); };

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1600px)');
    const resize = () => { setWide(media.matches); setContextOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

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
    if (!drawerOpen) return;
    const drawer = sidebarOpen ? drawerRef.current : contextRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer?.querySelector<HTMLElement>('button, a[href]')?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSidebarOpen(false);
        setContextOpen(false);
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
  }, [drawerOpen, sidebarOpen]);

  return (
    <div
      className={`workspace-shell${session ? '' : ' is-demo'}${layout.collapsed ? ' nav-collapsed' : ''}${showContext ? ' has-context' : ''}`}
      style={{ '--workspace-nav-width': `${layout.collapsed ? 0 : layout.width}px`, '--workspace-context-width': `${showContext ? layout.contextWidth : 0}px` } as CSSProperties}
    >
      <SkipToMain />
      <div inert={drawerOpen || helpOpen || shortcutsOpen || commandOpen || undefined}>
        <Header onMenuClick={() => setSidebarOpen(true)} onHelpClick={() => openHelp()} onSearchClick={() => setCommandOpen(true)} sidebarOpen={sidebarOpen} onContextClick={toggleContext} contextOpen={showContext || contextOpen} />
        <ConnectionStatus />
        <ApplicationRail onSearch={() => setCommandOpen(true)} onHelp={() => openHelp()} collapsed={layout.collapsed} onExpand={() => setLayout(state => ({ ...state, collapsed: false }))} />
        <aside className="workspace-desktop-nav" aria-label="Main navigation">
          <Sidebar collapsed={false} onToggle={() => setLayout((state) => ({ ...state, collapsed: !state.collapsed }))} />
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
        <WorkspaceTabs onSearch={() => setCommandOpen(true)} />
        {showContext && <aside className="workspace-context" aria-label="Portfolio pulse"><div className="workspace-context-heading"><strong>Portfolio pulse</strong><button type="button" className="workspace-icon-button" aria-label="Hide portfolio pulse" onClick={toggleContext}><X size={16} /></button></div><PortfolioContext /><PanelResizeHandle value={layout.contextWidth} min={228} max={340} defaultValue={252} direction={-1} label="Resize portfolio panel" className="workspace-context-resize" onChange={contextWidth => setLayout(state => ({ ...state, contextWidth }))} /></aside>}
        <main id="main-content" className="workspace-main" role="main" tabIndex={-1}>
          <div className="workspace-data-notice"><MockDataBanner /></div>
          <PageTransition>{children}</PageTransition>
        </main>
        <MobileNav />
        <WorkspaceStatus />
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
      {contextOpen && <div className="workspace-mobile-overlay" role="dialog" aria-modal="true" aria-label="Portfolio pulse" ref={contextRef}><div className="workspace-mobile-backdrop" aria-hidden="true" onClick={() => setContextOpen(false)} /><div className="workspace-context-drawer"><div className="workspace-context-heading"><strong>Portfolio pulse</strong><button type="button" className="workspace-icon-button" aria-label="Close portfolio pulse" onClick={() => setContextOpen(false)}><X size={18} /></button></div><PortfolioContext onNavigate={() => setContextOpen(false)} /></div></div>}
      <HelpPanel isOpen={helpOpen} onClose={closeHelp} initialTopic={initialTopic} />
      <KeyboardHelpModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onToggleNavigation={() => setLayout(state => ({ ...state, collapsed: !state.collapsed }))} onToggleContext={toggleContext} onResetLayout={() => { setLayout({ width: NAV_DEFAULT, collapsed: false, contextWidth: 252, contextHidden: false }); setContextOpen(false); }} />
    </div>
  );
}
