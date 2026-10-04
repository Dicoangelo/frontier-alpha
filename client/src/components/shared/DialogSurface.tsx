import { useEffect, useRef, type ReactNode } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { OverlayPortal } from './OverlayPortal';
import './dialog-surface.css';

interface DialogSurfaceProps {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  busy?: boolean;
  fullViewport?: boolean;
  className?: string;
}

/** A body-level modal with viewport sizing, keyboard containment and focus restoration. */
export function DialogSurface({ children, onClose, labelledBy, label, busy = false, fullViewport = false, className = '' }: DialogSurfaceProps) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, true);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, busy]);

  return <OverlayPortal>
    <div className={`viewport-dialog-overlay ${fullViewport ? 'viewport-dialog-overlay-full' : ''}`} onClick={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        aria-label={label} aria-busy={busy || undefined}
        className={`viewport-dialog-panel ${fullViewport ? 'viewport-dialog-panel-full' : ''} ${className}`}>
        {children}
      </div>
    </div>
  </OverlayPortal>;
}
