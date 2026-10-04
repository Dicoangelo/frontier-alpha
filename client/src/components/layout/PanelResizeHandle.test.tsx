import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelResizeHandle } from './PanelResizeHandle';

function ResizeableNavigation() {
  const [value, setValue] = useState(248);
  return <PanelResizeHandle value={value} onChange={setValue} min={216} max={336} defaultValue={248} />;
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
});
