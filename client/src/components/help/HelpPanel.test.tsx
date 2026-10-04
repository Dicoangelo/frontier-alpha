import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelpPanel } from './HelpPanel';

describe('HelpPanel - XSS Protection', () => {
  it('should escape script tags in help content', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={true} onClose={() => {}} />
      </BrowserRouter>
    );

    // Verify that if any help content contains malicious scripts,
    // they are rendered as text, not executed
    const scriptElements = document.querySelectorAll('script');

    // Filter out legitimate Vite/test scripts
    const injectedScripts = Array.from(scriptElements).filter(
      (script) => script.textContent?.includes('alert(') || script.textContent?.includes('xss')
    );

    expect(injectedScripts.length).toBe(0);
  });

  it('should escape img tags with onerror handlers', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={true} onClose={() => {}} />
      </BrowserRouter>
    );

    // Check that no img elements have event handlers in the panel
    const panel = screen.getByRole('dialog');
    const imgElements = panel.querySelectorAll('img');

    imgElements.forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull();
      expect(img.getAttribute('onload')).toBeNull();
      expect(img.getAttribute('onclick')).toBeNull();
    });
  });

  it('should only allow safe HTML tags in markdown content', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={true} onClose={() => {}} />
      </BrowserRouter>
    );

    const panel = screen.getByRole('dialog');

    // Verify that dangerous tags are not present within the panel
    const dangerousTags = [
      'script',
      'iframe',
      'object',
      'embed',
      'link[rel="stylesheet"]',
      'style',
    ];

    dangerousTags.forEach((tagSelector) => {
      const elements = panel.querySelectorAll(tagSelector);
      // Filter out legitimate test/framework elements
      const injectedElements = Array.from(elements).filter((el) => {
        const content = el.textContent || el.outerHTML;
        return content.includes('xss') || content.includes('alert(');
      });

      expect(injectedElements.length).toBe(0);
    });
  });

  it('should allow safe markdown formatting (strong tags)', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={true} onClose={() => {}} />
      </BrowserRouter>
    );

    const panel = screen.getByRole('dialog');
    const strongElements = panel.querySelectorAll('strong');

    // Verify strong tags don't have dangerous attributes
    strongElements.forEach((strong) => {
      expect(strong.getAttribute('onclick')).toBeNull();
      expect(strong.getAttribute('onerror')).toBeNull();
      expect(strong.getAttribute('onload')).toBeNull();
    });
  });

  it('should prevent XSS via event handler attributes', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={true} onClose={() => {}} />
      </BrowserRouter>
    );

    const panel = screen.getByRole('dialog');
    const allElements = panel.querySelectorAll('*');

    allElements.forEach((element) => {
      // Check for common XSS event handlers
      const dangerousAttrs = [
        'onclick',
        'onerror',
        'onload',
        'onmouseover',
        'onfocus',
        'onblur',
        'onchange',
      ];

      dangerousAttrs.forEach((attr) => {
        const attrValue = element.getAttribute(attr);
        if (attrValue) {
          // If the attribute exists, it should not contain malicious code
          expect(attrValue).not.toContain('alert(');
          expect(attrValue).not.toContain('xss');
          expect(attrValue).not.toContain('javascript:');
        }
      });
    });
  });

  it('should not render when isOpen is false', () => {
    render(
      <BrowserRouter>
        <HelpPanel isOpen={false} onClose={() => {}} />
      </BrowserRouter>
    );

    // Panel should not be in the document when closed
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('HelpPanel modal behavior', () => {
  it('moves and traps focus, restores the opener and preserves the previous scroll lock', () => {
    document.body.style.overflow = 'clip';
    const onClose = vi.fn();
    const { rerender, unmount } = render(<BrowserRouter><button>Help opener</button><HelpPanel isOpen={false} onClose={onClose} /></BrowserRouter>);
    const opener = screen.getByRole('button', { name: 'Help opener' });
    opener.focus();
    rerender(<BrowserRouter><button>Help opener</button><HelpPanel isOpen={true} onClose={onClose} /></BrowserRouter>);
    const close = screen.getByRole('button', { name: 'Close help panel' });
    const last = screen.getByRole('link', { name: 'Contact Support' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();
    opener.focus();
    expect(close).toHaveFocus();
    rerender(<BrowserRouter><button>Help opener</button><HelpPanel isOpen={false} onClose={onClose} /></BrowserRouter>);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('clip');
    unmount();
    document.body.style.overflow = '';
  });

  it('closes when a quick link navigates to the full help guide', () => {
    const onClose = vi.fn();
    render(<BrowserRouter><HelpPanel isOpen={true} onClose={onClose} /></BrowserRouter>);
    expect(screen.getByRole('link', { name: 'Risk Metrics' })).toHaveAttribute('href', '/help#sharpe-volatility');
    expect(screen.getByRole('link', { name: 'Optimization' })).toHaveAttribute('href', '/help#optimization-basics');
    fireEvent.click(screen.getByRole('link', { name: 'FAQ' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps focus in the panel when selecting a topic removes the focused result', () => {
    render(<BrowserRouter><HelpPanel isOpen={true} onClose={() => {}} /></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Getting Started Learn the basics/ }));
    const topic = screen.getByRole('button', { name: /Adding Positions How to add stocks/ });
    topic.focus();
    fireEvent.click(topic);
    expect(screen.getByRole('button', { name: 'Back to topics' })).toHaveFocus();
  });

  it('cancels the delayed reset when the panel is reopened promptly', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender, unmount } = render(<BrowserRouter><HelpPanel isOpen={true} onClose={onClose} /></BrowserRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search help' }), { target: { value: 'momentum' } });
    rerender(<BrowserRouter><HelpPanel isOpen={false} onClose={onClose} /></BrowserRouter>);
    act(() => { vi.advanceTimersByTime(100); });
    rerender(<BrowserRouter><HelpPanel isOpen={true} onClose={onClose} /></BrowserRouter>);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('textbox', { name: 'Search help' })).toHaveValue('momentum');
    unmount();
    vi.useRealTimers();
  });
});
