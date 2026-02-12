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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="relative w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl animate-fade-in-up"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <Keyboard className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Keyboard Shortcuts</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
              aria-label="Close keyboard shortcuts"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Shortcuts list */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              {ALL_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {shortcut.description}
                  </span>
                  <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-md text-xs font-mono font-medium text-[var(--color-text)] shadow-sm">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] rounded-b-2xl">
            <p className="text-xs text-[var(--color-text-muted)] text-center">
              Shortcuts are disabled when a text field is focused
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
