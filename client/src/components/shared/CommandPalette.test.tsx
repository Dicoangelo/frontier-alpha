import { useCallback, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

const state = vi.hoisted(() => ({
  auth: { session: null as { access_token: string } | null, logout: vi.fn() },
  theme: { resolved: 'light' as 'light' | 'dark', setTheme: vi.fn() },
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (store: typeof state.auth) => unknown) => selector(state.auth) }));
vi.mock('@/stores/themeStore', () => ({ useThemeStore: (selector: (store: typeof state.theme) => unknown) => selector(state.theme) }));

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function Harness() {
  const [open, setOpen] = useState(false);
  const onOpenChange = useCallback((value: boolean) => setOpen(value), []);
  return <><button onClick={() => setOpen(true)}>Open search</button><CommandPalette open={open} onOpenChange={onOpenChange} /><Location /></>;
}
function setup() {
  render(<MemoryRouter><Harness /></MemoryRouter>);
  const trigger = screen.getByRole('button', { name: 'Open search' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, search: screen.getByRole('combobox', { name: 'Command palette search' }) };
}

beforeEach(() => {
  state.auth.session = null;
  state.auth.logout.mockReset().mockResolvedValue(undefined);
  state.theme.resolved = 'light';
  state.theme.setTheme.mockReset();
});

describe('Command palette interaction contract', () => {
  it('does not open a competing focus trap over an existing modal', () => {
    const onOpenChange = vi.fn();
    render(<MemoryRouter><div role="dialog" aria-modal="true">Order review</div><CommandPalette open={false} onOpenChange={onOpenChange} /></MemoryRouter>);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('requests open changes through the controlled API and respects the parent value', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<MemoryRouter><CommandPalette open={false} onOpenChange={onOpenChange} /></MemoryRouter>);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<MemoryRouter><CommandPalette open onOpenChange={onOpenChange} /></MemoryRouter>);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('filters by all search terms and resets keyboard selection before navigating', async () => {
    const { search } = setup();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.change(search, { target: { value: 'allocation sharpe' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Optimize');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(search).toHaveAttribute('aria-activedescendant', options[0].id);
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/optimize'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('executes the command selected in visible order, including the appearance group', async () => {
    const { search } = setup();
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveTextContent('Switch to dark theme');
    for (let index = 1; index < options.length; index++) fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' }); // end boundary is clamped
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(state.theme.setTheme).toHaveBeenCalledWith('dark'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('traps Tab, restores trigger focus on Escape, and clears the next search', () => {
    document.body.style.overflow = 'auto';
    const { trigger, search } = setup();
    expect(search).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.change(search, { target: { value: 'earnings' } });
    fireEvent.keyDown(search, { key: 'Tab', shiftKey: true });
    const close = screen.getByRole('button', { name: 'Close search' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('auto');
    fireEvent.click(trigger);
    expect(screen.getByRole('combobox')).toHaveValue('');
    document.body.style.overflow = '';
  });

  it('hides sign-out when signed out and safely recovers from an empty result set', async () => {
    const { search } = setup();
    expect(screen.queryByRole('option', { name: /Sign out/ })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nonexistent-page-xyz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    await act(async () => fireEvent.keyDown(search, { key: 'Enter' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(state.auth.logout).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: 'positions holdings' } });
    expect(screen.getByRole('option', { name: /Portfolio/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/portfolio'));
  });

  it('retains the dialog and reports a failed sign-out action', async () => {
    state.auth.session = { access_token: 'test-session' };
    state.auth.logout.mockRejectedValueOnce(new Error('Sign-out unavailable'));
    const { search } = setup();
    fireEvent.change(search, { target: { value: 'logout' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This action could not be completed. Please try again.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
