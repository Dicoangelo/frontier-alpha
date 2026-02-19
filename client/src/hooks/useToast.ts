import { useCallback } from 'react';
import { toast } from '@/components/shared/Toast';
import type { ToastAction } from '@/components/shared/Toast';

interface ToastOptions {
  message?: string;
  duration?: number;
  action?: ToastAction;
}

/**
 * useToast — convenience hook for triggering toast notifications.
 *
 * Wraps the module-level `toast` singleton so callers don't need to import
 * it directly.  All methods are memoised so they are stable across renders.
 *
 * @example
 * const { toastSuccess, toastError } = useToast();
 * toastSuccess('Saved!', { message: 'Your changes have been saved.' });
 */
export function useToast() {
  const toastSuccess = useCallback(
    (title: string, options?: ToastOptions) =>
      toast.show({ type: 'success', title, ...options }),
    []
  );

  const toastError = useCallback(
    (title: string, options?: ToastOptions) =>
      toast.show({ type: 'error', title, duration: 8000, ...options }),
    []
  );

  const toastWarning = useCallback(
    (title: string, options?: ToastOptions) =>
      toast.show({ type: 'warning', title, duration: 6000, ...options }),
    []
  );

  const toastInfo = useCallback(
    (title: string, options?: ToastOptions) =>
      toast.show({ type: 'info', title, ...options }),
    []
  );

  return {
    toast,
    toastSuccess,
    toastError,
    toastWarning,
    toastInfo,
  };
}
