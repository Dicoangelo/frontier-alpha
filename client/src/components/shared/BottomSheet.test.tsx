import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';
import { DialogSurface } from './DialogSurface';

afterEach(() => vi.useRealTimers());
describe('Viewport bottom sheets', () => {
  it('escapes clipped route ancestors and restores focus after Escape', () => {
    vi.useFakeTimers();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <div style={{ transform: 'translateY(0)', overflow: 'hidden', height: 100 }}>
        <button onClick={() => setOpen(true)}>Open position</button>
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Position details"><button>Last action</button></BottomSheet>
      </div>;
    }
    const { container } = render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open position' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Position details' });
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('does not let an inactive sheet unlock another dialog’s page scroll', () => {
    render(<><DialogSurface label="Open dialog" onClose={() => {}}><button>Close</button></DialogSurface>
      <BottomSheet isOpen={false} onClose={() => {}}>Hidden</BottomSheet></>);
    expect(document.body.style.overflow).toBe('hidden');
  });
});
