/**
 * Unit Tests for useToast Hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from './useToast';
import { toast } from '@/components/shared/Toast';

describe('useToast', () => {
  beforeEach(() => {
    // Clear all toasts between tests
    act(() => {
      toast.dismissAll();
    });
  });

  it('returns toast, toastSuccess, toastError, toastWarning, toastInfo', () => {
    const { result } = renderHook(() => useToast());

    expect(typeof result.current.toast).toBe('object');
    expect(typeof result.current.toastSuccess).toBe('function');
    expect(typeof result.current.toastError).toBe('function');
    expect(typeof result.current.toastWarning).toBe('function');
    expect(typeof result.current.toastInfo).toBe('function');
  });

  it('toastSuccess calls toast.show with type success', () => {
    const showSpy = vi.spyOn(toast, 'show');
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toastSuccess('Saved!');
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Saved!' })
    );
  });

  it('toastError calls toast.show with type error and 8s duration', () => {
    const showSpy = vi.spyOn(toast, 'show');
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toastError('Something went wrong');
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Something went wrong', duration: 8000 })
    );
  });

  it('toastWarning calls toast.show with type warning and 6s duration', () => {
    const showSpy = vi.spyOn(toast, 'show');
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toastWarning('Check this');
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: 'Check this', duration: 6000 })
    );
  });

  it('toastInfo calls toast.show with type info', () => {
    const showSpy = vi.spyOn(toast, 'show');
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toastInfo('FYI');
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', title: 'FYI' })
    );
  });

  it('toastSuccess accepts optional message', () => {
    const showSpy = vi.spyOn(toast, 'show');
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toastSuccess('Saved!', { message: 'All changes saved.' });
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Saved!', message: 'All changes saved.' })
    );
  });

  it('toast methods are stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current.toastSuccess;

    rerender();

    expect(result.current.toastSuccess).toBe(first);
  });
});
