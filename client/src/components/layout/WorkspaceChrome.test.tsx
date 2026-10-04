import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ApplicationRail, PortfolioContext, WorkspaceTabs } from './WorkspaceChrome';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { session: null }) => unknown) => select({ session: null }) }));
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/hooks/useFeedStatus', () => ({ useFeedStatus: () => ({ label: 'Cached', aria: 'Cached daily quotes' }) }));
vi.mock('@/components/shared/BrandLogo', () => ({ BrandLogo: () => <span /> }));

const STORAGE_KEY = 'frontier-workspace-tabs-v1';
const paths = ['/portfolio', '/trade', '/optimize', '/factors', '/cvrf', '/ml', '/earnings', '/research'];
function RouteDriver() {
  const location = useLocation();
  const navigate = useNavigate();
  return <div><output aria-label="Current route">{location.pathname}</output>{paths.map(path => <button key={path} type="button" onClick={() => navigate(path)}>Visit {path}</button>)}</div>;
}
function renderTabs(path = '/', onSearch?: () => void) {
  return render(<MemoryRouter initialEntries={[path]}><WorkspaceTabs onSearch={onSearch} /><RouteDriver /></MemoryRouter>);
}
const tabLinks = () => within(screen.getByRole('navigation', { name: 'Workspace tabs' })).getAllByRole('link');

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('WorkspaceTabs', () => {
  it('restores only recognized paths, deduplicates the overview alias, and never saves URL query or hash data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['/research', '/trade?token=private', 'https://example.com', '/dashboard', '/unknown', {}, '/research']));
    const { unmount } = renderTabs('/portfolio?symbol=PRIVATE#private-note');
    expect(tabLinks().map(link => link.textContent)).toEqual(['Overview', 'Agent research', 'Holdings']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['/', '/research', '/portfolio']);
    expect(screen.queryByRole('button', { name: 'Close Overview' })).not.toBeInTheDocument();
    unmount();
    renderTabs('/dashboard');
    expect(tabLinks().map(link => link.textContent)).toEqual(['Overview', 'Agent research', 'Holdings']);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens visited routes up to eight tabs, retains Overview, and does not duplicate or reorder revisited tabs', () => {
    renderTabs();
    paths.forEach(path => fireEvent.click(screen.getByRole('button', { name: `Visit ${path}` })));
    expect(tabLinks()).toHaveLength(8);
    expect(tabLinks()[0]).toHaveTextContent('Overview');
    expect(screen.queryByRole('link', { name: 'Holdings' })).not.toBeInTheDocument();
    const before = tabLinks().map(link => link.getAttribute('href'));
    fireEvent.click(screen.getByRole('button', { name: 'Visit /trade' }));
    expect(tabLinks().map(link => link.getAttribute('href'))).toEqual(before);
    expect(screen.getByRole('link', { name: 'Trade' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes an active tab into its neighbor and preserves keyboard focus; closing a background tab keeps the current route', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['/', '/portfolio', '/trade', '/research']));
    renderTabs('/research');
    fireEvent.click(screen.getByRole('button', { name: 'Close Holdings' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/research');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent research' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/trade');
    expect(screen.getByRole('link', { name: 'Trade' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Trade' })).toHaveAttribute('aria-current', 'page');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['/', '/trade']);
    fireEvent.click(screen.getByRole('button', { name: 'Close Trade' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus();
  });

  it('opens command search from the plus control and works with blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const onSearch = vi.fn();
    renderTabs('/research', onSearch);
    fireEvent.click(screen.getByRole('button', { name: 'Open a workspace view' }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Agent research' })).toHaveAttribute('href', '/research');
    fireEvent.click(screen.getByRole('button', { name: 'Close Agent research' }));
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Agent research entry points', () => {
  it('exposes native rail and context links, with the context close callback preserved', () => {
    const onNavigate = vi.fn();
    render(<MemoryRouter><ApplicationRail onSearch={vi.fn()} onHelp={vi.fn()} collapsed={false} onExpand={vi.fn()} /><PortfolioContext onNavigate={onNavigate} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Open agent research' })).toHaveAttribute('href', '/research');
    const contextLink = screen.getByRole('link', { name: /Agent research Investigate/ });
    expect(contextLink).toHaveAttribute('href', '/research');
    fireEvent.click(contextLink);
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
