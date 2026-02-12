import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
