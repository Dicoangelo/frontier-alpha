import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Viewport overlays must escape transformed, clipped, and animated route ancestors. */
export function OverlayPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
