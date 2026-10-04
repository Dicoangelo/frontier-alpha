import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keeps transactional dialogs above the workspace and keyboard focus inside. */
export function WorkspaceDialog({ children, labelledBy, onClose, busy = false }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const state = useRef({ onClose, busy });
  useEffect(() => { state.current = { onClose, busy }; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!state.current.busy) state.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ) ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div className="workspace-dialog-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        aria-busy={busy} tabIndex={-1} className="transaction-workspace workspace-dialog">
        {children}
      </div>
    </div>, document.body,
  );
}
