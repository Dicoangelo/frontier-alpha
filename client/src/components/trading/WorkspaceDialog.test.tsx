import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceDialog } from './WorkspaceDialog';

describe('Transactional dialog keyboard behavior', () => {
  it('contains focus, closes on Escape, and restores its trigger', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(<WorkspaceDialog labelledBy="test-title" onClose={onClose}>
      <h2 id="test-title">Review</h2><button>Cancel</button><button>Confirm</button>
    </WorkspaceDialog>);
    expect(screen.getByRole('dialog', { name: 'Review' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it('does not dismiss an in-flight submission with Escape or backdrop', () => {
    const onClose = vi.fn();
    render(<WorkspaceDialog labelledBy="busy-title" onClose={onClose} busy>
      <h2 id="busy-title">Submitting</h2><button disabled>Pending</button>
    </WorkspaceDialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden');
  });
});
