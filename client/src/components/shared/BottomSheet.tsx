import { useState, useRef, useEffect, useCallback, useId } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { OverlayPortal } from './OverlayPortal';
import { useDialogFocus } from '@/hooks/useDialogFocus';

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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, isOpen);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const heightClasses = {
    auto: 'max-h-[85dvh]',
    half: 'h-[50dvh]',
    full: 'h-[95dvh]',
  };

  const handleClose = useCallback(() => {
    if (closeTimer.current) return;
    setIsClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  // Animate the sheet without making its route ancestor a positioning context.
  useEffect(() => {
    if (!isOpen) return;
    setIsEntering(true);
    const frame = requestAnimationFrame(() => setIsEntering(false));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Handle drag to close
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;

    const sheet = sheetRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      // Keep scrolling the content independent of the dismiss gesture.
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sheet-handle]')) return;

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
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable (only calls onClose prop)
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
    <OverlayPortal>
    <div className="fixed inset-0 z-[110]" role="presentation">
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
          flex flex-col min-h-0
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
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Details'}
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
                  id={titleId}
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
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
          {children}
        </div>
      </div>
    </div>
    </OverlayPortal>
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
