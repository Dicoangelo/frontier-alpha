import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeyboardHelpModal } from './KeyboardHelpModal';

describe('KeyboardHelpModal focus and scroll ownership', () => {
  it('focuses its control, traps Tab, closes on Escape, and restores the opener and prior overflow', () => {
    document.body.style.overflow = 'clip';
    const onClose = vi.fn();
    const { rerender, unmount } = render(<><button>Show shortcuts</button><KeyboardHelpModal isOpen={false} onClose={onClose} /></>);
    const opener = screen.getByRole('button', { name: 'Show shortcuts' });
    opener.focus();
    rerender(<><button>Show shortcuts</button><KeyboardHelpModal isOpen={true} onClose={onClose} /></>);
    const close = screen.getByRole('button', { name: 'Close keyboard shortcuts' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<><button>Show shortcuts</button><KeyboardHelpModal isOpen={false} onClose={onClose} /></>);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('clip');
    unmount();
    document.body.style.overflow = '';
  });
});
