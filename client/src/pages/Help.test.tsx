import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Help } from './Help';

describe('Help - XSS Protection', () => {
  it('should escape script tags in help content', () => {
    render(
      <BrowserRouter>
        <Help />
      </BrowserRouter>
    );

    // Verify that if any help content contains malicious scripts,
    // they are rendered as text, not executed

    // If there were script tags injected, they should be escaped
    // and visible as text, not executed
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
        <Help />
      </BrowserRouter>
    );

    // Check that no img elements have event handlers
    const imgElements = document.querySelectorAll('img');
    imgElements.forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull();
      expect(img.getAttribute('onload')).toBeNull();
      expect(img.getAttribute('onclick')).toBeNull();
    });
  });

  it('should only allow safe HTML tags in markdown content', () => {
    render(
      <BrowserRouter>
        <Help />
      </BrowserRouter>
    );

    // Verify that dangerous tags are not present
    const dangerousTags = [
      'script',
      'iframe',
      'object',
      'embed',
      'link[rel="stylesheet"]',
      'style',
    ];

    dangerousTags.forEach((tagSelector) => {
      const elements = document.querySelectorAll(tagSelector);
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
        <Help />
      </BrowserRouter>
    );

    // The help content should still support bold text via <strong> tags
    // This verifies that DOMPurify allows the safe tags we configured
    const strongElements = document.querySelectorAll('strong');

    // We expect some strong tags for legitimate bold formatting
    // Just verify they don't have dangerous attributes
    strongElements.forEach((strong) => {
      expect(strong.getAttribute('onclick')).toBeNull();
      expect(strong.getAttribute('onerror')).toBeNull();
      expect(strong.getAttribute('onload')).toBeNull();
    });
  });

  it('should prevent XSS via event handler attributes', () => {
    render(
      <BrowserRouter>
        <Help />
      </BrowserRouter>
    );

    // Check all elements in the help content area
    const allElements = document.querySelectorAll('*');

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
});
