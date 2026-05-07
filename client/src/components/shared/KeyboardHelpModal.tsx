import { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';
import { ALL_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import { useFocusTrap } from '@/components/shared/VisuallyHidden';

interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Backdrop — family pattern */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="glass-modal relative w-full max-w-md rounded-2xl overflow-hidden animate-enter shadow-[0_30px_80px_-20px_rgba(123,44,255,0.35)]"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          {/* Sovereign top rail */}
          <div className="sovereign-bar absolute top-0 left-0 right-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-theme">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
              >
                <Keyboard className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted">
                  HELP · Shortcuts
                </p>
                <h2 className="text-lg font-bold text-theme mt-0.5">Keyboard Shortcuts</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-theme-muted hover:text-theme rounded-lg transition-colors animate-press"
              aria-label="Close keyboard shortcuts"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Shortcuts list */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1 animate-stagger">
              {ALL_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors animate-enter"
                >
                  <span className="text-sm text-theme-secondary leading-relaxed">
                    {shortcut.description}
                  </span>
                  <kbd className="glass-slab inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded mono text-[11px] text-theme-secondary border border-theme">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-theme bg-[var(--color-bg-tertiary)]">
            <p className="text-[10px] mono tracking-[0.2em] uppercase text-theme-muted text-center">
              Disabled while a text field is focused
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
