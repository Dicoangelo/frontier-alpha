/**
 * Tests for the quality-window classifier (IDEA-CIN-4).
 *
 * All fixture timestamps are explicit UTC instants chosen to land at known
 * US/Eastern wall-clock times (June = EDT = UTC-4), so the tests are
 * deterministic regardless of the runner's local timezone.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getQualityWindow, DataQualityBadge } from './DataQualityBadge';

// Wednesday 2026-06-10, EDT (UTC-4)
const ET = (hour: number, minute: number) =>
  new Date(Date.UTC(2026, 5, 10, hour + 4, minute, 0));

describe('getQualityWindow', () => {
  it('classifies the first 30 minutes after the open as noisy', () => {
    expect(getQualityWindow(ET(9, 30))).toBe('noisy');
    expect(getQualityWindow(ET(9, 59))).toBe('noisy');
  });

  it('classifies the last 30 minutes before the close as noisy', () => {
    expect(getQualityWindow(ET(15, 30))).toBe('noisy');
    expect(getQualityWindow(ET(15, 59))).toBe('noisy');
  });

  it('classifies midday as clean', () => {
    expect(getQualityWindow(ET(10, 0))).toBe('clean');
    expect(getQualityWindow(ET(12, 30))).toBe('clean');
    expect(getQualityWindow(ET(15, 29))).toBe('clean');
  });

  it('classifies pre-market and after-hours as settled', () => {
    expect(getQualityWindow(ET(9, 29))).toBe('settled');
    expect(getQualityWindow(ET(16, 0))).toBe('settled');
    expect(getQualityWindow(ET(20, 0))).toBe('settled');
  });

  it('classifies weekends as settled even at midday', () => {
    // Saturday 2026-06-13 12:00 ET
    const saturdayNoon = new Date(Date.UTC(2026, 5, 13, 16, 0, 0));
    expect(getQualityWindow(saturdayNoon)).toBe('settled');
  });
});

describe('DataQualityBadge', () => {
  it('renders the window label and exposes the class for styling hooks', () => {
    render(<DataQualityBadge capturedAt={ET(12, 0)} />);
    const badge = screen.getByTestId('data-quality-badge');
    expect(badge).toHaveAttribute('data-quality-window', 'clean');
    expect(badge).toHaveTextContent(/mid-session/i);
  });

  it('explains the noisy window via tooltip text', () => {
    render(<DataQualityBadge capturedAt={ET(9, 45)} />);
    const badge = screen.getByTestId('data-quality-badge');
    expect(badge).toHaveAttribute('data-quality-window', 'noisy');
    expect(badge.getAttribute('title')).toMatch(/auction/i);
  });
});
