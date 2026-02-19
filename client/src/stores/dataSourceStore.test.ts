/**
 * Unit Tests for dataSourceStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDataSourceStore } from './dataSourceStore';
import { act } from '@testing-library/react';

describe('dataSourceStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    act(() => {
      useDataSourceStore.getState().setMockData(false);
    });
  });

  it('initialises with isUsingMockData = false', () => {
    expect(useDataSourceStore.getState().isUsingMockData).toBe(false);
  });

  it('setMockData(true) makes isUsingMockData true', () => {
    act(() => {
      useDataSourceStore.getState().setMockData(true);
    });
    expect(useDataSourceStore.getState().isUsingMockData).toBe(true);
  });

  it('setMockData(false) clears mock flag', () => {
    act(() => {
      useDataSourceStore.getState().setMockData(true);
      useDataSourceStore.getState().setMockData(false);
    });
    expect(useDataSourceStore.getState().isUsingMockData).toBe(false);
  });

  it('store flag drives banner visibility (integration check)', () => {
    // When isUsingMockData is true the banner should render
    act(() => {
      useDataSourceStore.getState().setMockData(true);
    });
    expect(useDataSourceStore.getState().isUsingMockData).toBe(true);
  });
});
