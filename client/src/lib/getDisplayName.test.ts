/**
 * Unit Tests for getDisplayName (US-003)
 *
 * Verifies that `+suffix` email aliases are stripped before deriving
 * the greeting display name, and that non-aliased emails preserve the
 * existing capitalize-first-letter convention.
 */

import { describe, it, expect } from 'vitest';
import { getDisplayName } from './getDisplayName';

describe('getDisplayName', () => {
  it('strips +suffix aliases from the local part', () => {
    expect(getDisplayName('dicoangelo+dev@metaventionsai.com')).toBe('Dicoangelo');
  });

  it('preserves non-aliased emails with first-letter capitalization', () => {
    expect(getDisplayName('jane.doe@example.com')).toBe('Jane.doe');
  });

  it('handles multiple plus-segments before the @', () => {
    expect(getDisplayName('user+foo+bar@example.com')).toBe('User');
  });

  it('returns "Investor" for null', () => {
    expect(getDisplayName(null)).toBe('Investor');
  });

  it('returns "Investor" for undefined', () => {
    expect(getDisplayName(undefined)).toBe('Investor');
  });

  it('returns "Investor" for an empty string', () => {
    expect(getDisplayName('')).toBe('Investor');
  });

  it('capitalizes a simple lowercase email local part', () => {
    expect(getDisplayName('alice@example.com')).toBe('Alice');
  });

  it('does not strip a plus that appears after the @ (defensive)', () => {
    // Not a realistic email, but verify the regex anchors on @.
    expect(getDisplayName('alice@host+tag.com')).toBe('Alice');
  });
});
