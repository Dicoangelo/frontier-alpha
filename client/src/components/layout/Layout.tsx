import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { SkipToMain } from '@/components/shared/VisuallyHidden';
import { HelpPanel, useHelpPanel, FloatingHelpButton } from '@/components/help';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { MockDataBanner } from '@/components/shared/MockDataBanner';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { isOpen: helpOpen, openHelp, closeHelp, initialTopic } = useHelpPanel();

  // Close sidebar when pressing Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-theme grid-bg transition-colors">
      {/* Skip to main content link for keyboard users */}
      <SkipToMain />

      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} onHelpClick={() => openHelp()} />
      <MockDataBanner />
      <ConnectionStatus />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block" aria-label="Main navigation">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed left-0 top-0 bottom-0 w-64 glass-slab-floating z-50 shadow-2xl animate-slide-in-left"
            aria-label="Mobile navigation"
          >
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main
        id="main-content"
        className="flex-1 p-4 sm:p-6 lg:p-8 lg:ml-64 mt-16 pb-20 lg:pb-8"
        role="main"
        tabIndex={-1}
      >
        {/* Page transition wrapper - re-triggers animation on route change */}
        <div key={location.pathname} className="animate-fade-in">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Floating Help Button (mobile) */}
      <FloatingHelpButton onClick={() => openHelp()} />

      {/* Help Panel */}
      <HelpPanel isOpen={helpOpen} onClose={closeHelp} initialTopic={initialTopic} />
    </div>
  );
}
