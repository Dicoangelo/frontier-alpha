import type { ReactNode, ElementType } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: ElementType;
}

/**
 * Visually hides content while keeping it accessible to screen readers.
 * Use for providing additional context without affecting visual design.
 */
export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return (
    <Tag
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: '0',
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: '0',
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Announces dynamic content changes to screen readers.
 * Use for notifications, status updates, and async results.
 */
interface LiveRegionProps {
  children: ReactNode;
  mode?: 'polite' | 'assertive';
  atomic?: boolean;
}

export function LiveRegion({ children, mode = 'polite', atomic = true }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={mode}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
}

/**
 * Focus trap for modals and dialogs.
 * Ensures keyboard users can't tab outside the component.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isActive || !ref.current || e.key !== 'Tab') return;

    const focusableElements = ref.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  };

  React.useEffect(() => {
    if (isActive) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleKeyDown depends only on isActive and ref which are already deps
  }, [isActive, ref]);
}

import React from 'react';

/**
 * Skip to main content link for keyboard users.
 * Place at the very start of the page.
 */
export function SkipToMain({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4 focus:z-[100]
        focus:px-4 focus:py-2 focus:bg-[var(--color-info)] focus:text-white
        focus:rounded-lg focus:shadow-lg focus:outline-none
        focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600
      "
    >
      Skip to main content
    </a>
  );
}

/**
 * Utility to announce messages to screen readers programmatically.
 */
let announcerElement: HTMLDivElement | null = null;

// eslint-disable-next-line react-refresh/only-export-components
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return;

  if (!announcerElement) {
    announcerElement = document.createElement('div');
    announcerElement.setAttribute('aria-live', priority);
    announcerElement.setAttribute('aria-atomic', 'true');
    announcerElement.setAttribute('role', 'status');
    announcerElement.style.position = 'absolute';
    announcerElement.style.width = '1px';
    announcerElement.style.height = '1px';
    announcerElement.style.padding = '0';
    announcerElement.style.margin = '-1px';
    announcerElement.style.overflow = 'hidden';
    announcerElement.style.clip = 'rect(0, 0, 0, 0)';
    announcerElement.style.whiteSpace = 'nowrap';
    announcerElement.style.border = '0';
    document.body.appendChild(announcerElement);
  }

  // Update aria-live attribute if priority changes
  announcerElement.setAttribute('aria-live', priority);

  // Clear and set message (needed for re-announcement of same message)
  announcerElement.textContent = '';
  setTimeout(() => {
    if (announcerElement) {
      announcerElement.textContent = message;
    }
  }, 100);
}
