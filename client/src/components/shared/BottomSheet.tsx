import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  kicker?: string;
  children: ReactNode;
  height?: 'auto' | 'half' | 'full';
  showHandle?: boolean;
  showCloseButton?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  kicker,
  children,
  height = 'auto',
  showHandle = true,
  showCloseButton = true,
}: BottomSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const heightClasses = {
    auto: 'max-h-[80vh]',
    half: 'h-[50vh]',
    full: 'h-[90vh]',
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
      // Return focus to the element that opened the sheet
      previousFocusRef.current?.focus();
    }, 300);
  }, [onClose]);

  // Capture previous focus and move focus into the sheet when it opens
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Slide-in: start translated, then release on next frame
      setIsEntering(true);
      const raf = requestAnimationFrame(() => setIsEntering(false));
      // Focus the sheet itself (or first focusable child) after render
      const timer = setTimeout(() => {
        const focusable = sheetRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        (focusable ?? sheetRef.current)?.focus();
      }, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isOpen]);

  // Focus trap: keep Tab within the sheet while it is open
  useEffect(() => {
    if (!isOpen) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // Handle drag to close
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;

    const sheet = sheetRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      // Only drag from handle or top area
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sheet-handle]') && sheet.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      setIsDragging(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;

      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        setDragY(delta);
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;

      setIsDragging(false);

      if (dragY > 150) {
        handleClose();
      }

      setDragY(0);
    };

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd);

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable (only calls onClose prop)
  }, [isOpen, isDragging, dragY]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable (only calls onClose prop)
  }, [isOpen]);

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

  if (!isOpen && !isClosing) return null;

  // Compute transform: enter from below, exit below, drag follows finger
  let transform: string | undefined;
  if (isDragging) {
    transform = `translateY(${dragY}px)`;
  } else if (isClosing || isEntering) {
    transform = 'translateY(100%)';
  } else {
    transform = 'translateY(0)';
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* Backdrop */}
      <div
        className={`
          absolute inset-0 bg-black/60 backdrop-blur-sm
          transition-opacity duration-300
          ${isClosing || isEntering ? 'opacity-0' : 'opacity-100 animate-fade-in'}
        `}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          absolute bottom-0 left-0 right-0
          glass-modal rounded-t-3xl
          shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.4)]
          flex flex-col
          ${heightClasses[height]}
        `}
        style={{
          transform,
          transition: isDragging
            ? 'none'
            : 'transform var(--motion-duration-slow) var(--motion-ease-out)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'sheet-title' : undefined}
        tabIndex={-1}
      >
        {/* Drag handle */}
        {showHandle && (
          <div
            data-sheet-handle
            className="flex-shrink-0 pt-3 pb-2 cursor-grab active:cursor-grabbing"
          >
            <div className="mx-auto h-1 w-12 rounded-full bg-theme-tertiary" />
          </div>
        )}

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-6 pt-2 pb-4 border-b border-theme">
            <div className="min-w-0">
              {kicker && (
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
                  {kicker}
                </p>
              )}
              {title && (
                <h2
                  id="sheet-title"
                  className="text-lg font-semibold text-theme"
                >
                  {title}
                </h2>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={handleClose}
                className="flex-shrink-0 p-2.5 -mr-2 min-w-[44px] min-h-[44px] rounded-sm text-theme-muted hover:text-theme transition-colors duration-200 flex items-center justify-center touch-manipulation animate-press focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 max-h-[80vh]">
          {children}
        </div>
      </div>
    </div>
  );
}

// Convenience hook for managing bottom sheet state
// eslint-disable-next-line react-refresh/only-export-components
export function useBottomSheet() {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
