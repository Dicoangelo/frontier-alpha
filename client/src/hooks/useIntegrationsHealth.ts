/**
 * useIntegrationsHealth — graceful-degradation hook for external integrations.
 *
 * Calls `/api/v1/health/integrations` once on mount (cached by React Query)
 * and reports the live/degraded status of Stripe, Alpaca, and email delivery.
 *
 * If the endpoint is unreachable (404, network error, server boot order race),
 * the hook defaults to `"live"` optimistically — never blocks UI.
 *
 * Consumed by:
 *   - `pages/Pricing.tsx`  (Stripe gating)
 *   - `pages/Trading.tsx`  (Alpaca gating)
 *   - `pages/Alerts.tsx`   (Email-delivery gating)
 *
 * The matching endpoint is being built in parallel; until it lands, this hook
 * silently falls back to "all live" so the UI continues to function.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

export type IntegrationStatus = 'live' | 'degraded';

export interface IntegrationHealth {
  status: IntegrationStatus;
}

export interface IntegrationsHealthResponse {
  integrations: {
    stripe: IntegrationHealth;
    alpaca: IntegrationHealth;
    emailDelivery: IntegrationHealth;
  };
}

/** Optimistic default — assume everything is live unless we hear otherwise. */
const OPTIMISTIC_DEFAULT: IntegrationsHealthResponse = {
  integrations: {
    stripe: { status: 'live' },
    alpaca: { status: 'live' },
    emailDelivery: { status: 'live' },
  },
};

/**
 * Normalises any partial / malformed payload into a complete shape.
 * Anything missing or non-`"degraded"` is treated as `"live"`.
 */
function normalise(raw: unknown): IntegrationsHealthResponse {
  if (!raw || typeof raw !== 'object') return OPTIMISTIC_DEFAULT;

  const root = raw as { integrations?: unknown; data?: { integrations?: unknown } };
  // Allow either {integrations: ...} or {data: {integrations: ...}}
  const integrationsRaw =
    (root.integrations as Record<string, unknown> | undefined) ??
    (root.data?.integrations as Record<string, unknown> | undefined);

  if (!integrationsRaw || typeof integrationsRaw !== 'object') {
    return OPTIMISTIC_DEFAULT;
  }

  const pick = (key: string): IntegrationHealth => {
    const node = integrationsRaw[key] as { status?: unknown } | undefined;
    const status: IntegrationStatus = node?.status === 'degraded' ? 'degraded' : 'live';
    return { status };
  };

  return {
    integrations: {
      stripe: pick('stripe'),
      alpaca: pick('alpaca'),
      emailDelivery: pick('emailDelivery'),
    },
  };
}

/**
 * useIntegrationsHealth — once-per-session cached fetch with optimistic fallback.
 */
export function useIntegrationsHealth(): IntegrationsHealthResponse {
  // US-003: hold the request until the auth store has finished its
  // initial Supabase session-load. The endpoint is open-readable but the
  // axios interceptor + page consumers expect a Bearer when the user is
  // signed in; firing before hydration produces 401 noise on cold loads.
  const isReady = useAuthStore((s) => s.isReady);

  const { data } = useQuery<IntegrationsHealthResponse>({
    queryKey: ['health', 'integrations'],
    queryFn: async () => {
      try {
        // The api client unwraps `response.data` automatically (see client.ts).
        const payload = await api.get('/health/integrations');
        return normalise(payload);
      } catch {
        // Endpoint missing / network error — never block the UI.
        return OPTIMISTIC_DEFAULT;
      }
    },
    enabled: isReady,
    // Once per app mount: long staleTime, no refetch on window focus.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    placeholderData: OPTIMISTIC_DEFAULT,
  });

  return data ?? OPTIMISTIC_DEFAULT;
}

/** Convenience selector — returns just the stripe status (live by default). */
export function useStripeStatus(): IntegrationStatus {
  return useIntegrationsHealth().integrations.stripe.status;
}

/** Convenience selector — returns just the alpaca status (live by default). */
export function useAlpacaStatus(): IntegrationStatus {
  return useIntegrationsHealth().integrations.alpaca.status;
}

/** Convenience selector — returns just the email-delivery status (live by default). */
export function useEmailDeliveryStatus(): IntegrationStatus {
  return useIntegrationsHealth().integrations.emailDelivery.status;
}
