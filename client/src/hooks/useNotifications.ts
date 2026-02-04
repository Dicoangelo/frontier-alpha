import { useState, useEffect, useCallback } from 'react';

interface NotificationState {
  permission: NotificationPermission;
  isSupported: boolean;
  subscription: PushSubscription | null;
}

// VAPID public key - in production, this should come from environment
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({
    permission: 'default',
    isSupported: false,
    subscription: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check support and current permission on mount
  useEffect(() => {
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

    setState((prev) => ({
      ...prev,
      isSupported,
      permission: isSupported ? Notification.permission : 'denied',
    }));

    // Get existing subscription if any
    if (isSupported && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setState((prev) => ({ ...prev, subscription }));
        });
      });
    }
  }, []);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setError('Push notifications are not supported in this browser');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));

      if (permission !== 'granted') {
        setError('Notification permission denied');
        return false;
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request permission');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [state.isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.isSupported) {
      setError('Push notifications are not supported');
      return null;
    }

    if (state.permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription && VAPID_PUBLIC_KEY) {
        // Create new subscription
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
      }

      if (subscription) {
        // Send subscription to server
        await sendSubscriptionToServer(subscription);
        setState((prev) => ({ ...prev, subscription }));
      }

      return subscription;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [state.isSupported, state.permission, requestPermission]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.subscription) return true;

    setIsLoading(true);
    setError(null);

    try {
      await state.subscription.unsubscribe();
      await removeSubscriptionFromServer(state.subscription);
      setState((prev) => ({ ...prev, subscription: null }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [state.subscription]);

  // Show local notification (for testing)
  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (state.permission !== 'granted') {
        setError('Notification permission not granted');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          ...options,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to show notification');
      }
    },
    [state.permission]
  );

  return {
    ...state,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    showNotification,
  };
}

// Helper to send subscription to server
async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  try {
    const token = localStorage.getItem('supabase_token');
    await fetch('/api/v1/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });
  } catch (error) {
    console.error('Failed to send subscription to server:', error);
  }
}

// Helper to remove subscription from server
async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  try {
    const token = localStorage.getItem('supabase_token');
    await fetch('/api/v1/notifications/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      }),
    });
  } catch (error) {
    console.error('Failed to remove subscription from server:', error);
  }
}
