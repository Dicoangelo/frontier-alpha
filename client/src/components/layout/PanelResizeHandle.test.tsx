import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelResizeHandle } from './PanelResizeHandle';

function ResizeableNavigation({ direction = 1 }: { direction?: 1 | -1 }) {
  const [value, setValue] = useState(248);
  return <PanelResizeHandle value={value} onChange={setValue} min={216} max={336} defaultValue={248} direction={direction} />;
}

describe('navigation resizing', () => {
  it('supports keyboard adjustments, boundary jumps, and reset', () => {
    render(<ResizeableNavigation />);
    const handle = screen.getByRole('separator', { name: 'Resize navigation' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '258');
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(handle).toHaveAttribute('aria-valuenow', '288');
    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '216');
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '336');
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '248');
  });

  it('reverses arrow adjustments for a right-hand panel without reversing bounds or reset', () => {
    render(<ResizeableNavigation direction={-1} />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '258');
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(handle).toHaveAttribute('aria-valuenow', '288');
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(handle).toHaveAttribute('aria-valuenow', '258');
    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '216');
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '336');
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '248');
  });

  it('drags a right-hand panel from its left edge and cancels with Escape', () => {
    render(<ResizeableNavigation direction={-1} />);
    const handle = screen.getByRole('separator');
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(handle, { setPointerCapture, hasPointerCapture: () => true, releasePointerCapture });
    // jsdom has no PointerEvent constructor; supply the native event fields
    // React reads without replacing the production pointer handlers.
    const pointer = (type: string, x: number, pointerId = 7) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x });
      Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
      fireEvent(handle, event);
    };
    pointer('pointerdown', 700);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    pointer('pointermove', 660);
    expect(handle).toHaveAttribute('aria-valuenow', '288');
    pointer('pointermove', 500, 8); // a second pointer cannot resize this drag
    expect(handle).toHaveAttribute('aria-valuenow', '288');
    fireEvent.keyDown(handle, { key: 'Escape' });
    expect(handle).toHaveAttribute('aria-valuenow', '248');
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    pointer('pointermove', 600);
    expect(handle).toHaveAttribute('aria-valuenow', '248');
  });

});
