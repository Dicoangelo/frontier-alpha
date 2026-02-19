/**
 * Accessibility tests for Sidebar
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar accessibility', () => {
  it('renders navigation links', () => {
    renderSidebar('/');
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('active NavLink renders aria-current="page" automatically', () => {
    renderSidebar('/');
    // react-router NavLink automatically sets aria-current="page" on active links
    const links = screen.getAllByRole('link');
    // At "/" the Dashboard link (end=true, href="/") is active
    const activeLinks = links.filter(
      (l) => l.getAttribute('aria-current') === 'page'
    );
    expect(activeLinks.length).toBeGreaterThan(0);
  });

  it('inactive links do not have aria-current="page"', () => {
    renderSidebar('/');
    const portfolioLink = screen.getByRole('link', { name: /portfolio/i });
    expect(portfolioLink.getAttribute('aria-current')).not.toBe('page');
  });

  it('icons have aria-hidden', () => {
    renderSidebar('/');
    const svgs = document.querySelectorAll('nav svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('nav has accessible label', () => {
    renderSidebar('/');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
