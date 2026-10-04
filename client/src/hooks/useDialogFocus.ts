import { useEffect, type RefObject } from 'react';

/** Focus and scroll ownership for a single modal surface. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    const focusFirst = () => (controls()[0] ?? dialog).focus({ preventScroll: true });
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const available = controls();
      const first = available[0];
      const last = available[available.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    document.body.style.overflow = 'hidden';
    focusFirst();
    document.addEventListener('keydown', trapTab, true);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', trapTab, true);
      document.removeEventListener('focusin', keepFocusInside);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [ref, open]);

  // A topic/search result can remove the currently focused control. Bring
  // focus back inside after that render so shortcuts cannot reach the page.
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]') ?? dialog).focus({ preventScroll: true });
    }
  });

}
