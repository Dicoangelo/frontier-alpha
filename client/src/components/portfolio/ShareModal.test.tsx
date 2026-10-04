import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareModal } from './ShareModal';

vi.mock('@/api/client', () => ({ api: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/shared/Toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe('Sharing dialog placement', () => {
  it('opens above transformed content and supports Escape without creating a share', async () => {
    const onClose = vi.fn();
    const { container } = render(<QueryClientProvider client={new QueryClient()}>
      <div style={{ transform: 'translateY(0)', overflow: 'hidden', width: 320, height: 100 }}>
        <ShareModal isOpen onClose={onClose} portfolioId="test" portfolioName="Example portfolio" />
      </div>
    </QueryClientProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Share Portfolio' });
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole('button', { name: 'Close sharing' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    const { api } = await import('@/api/client');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
