import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { useDataSourceStore } from '@/stores/dataSourceStore';
import { setMockMode } from '@/components/shared/MockDataBanner';
import { supabase } from '@/lib/supabase';

/**
 * Replay-attempt flag carried on the per-request axios config (US-003).
 *
 * The 401 response interceptor reads this BEFORE attempting `refreshSession`
 * + replay. If a request has already been replayed once and still 401s, we
 * surface the error and let the caller drop to its empty / unauthed state
 * instead of looping the refresh-replay forever (which would chew through
 * Supabase refresh-token rotation budget and lock the user out).
 */
type RetriableConfig = InternalAxiosRequestConfig & {
  _us003RefreshAttempt?: boolean;
};

const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Add auth token to requests.
//
// Race fix: on first paint, components may fire requests before the auth store
// has hydrated from Supabase, causing 401s on `/portfolio` etc. If the store
// is empty but Supabase has a persisted session, fall back to the SDK to
// fetch the live session synchronously (Supabase JS caches it locally).
api.interceptors.request.use(async (config) => {
  let session = useAuthStore.getState().session;
  if (!session?.access_token) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) session = data.session;
    } catch {
      // Network or SDK error — proceed without a token. The request will 401
      // and the page will surface its empty / error state.
    }
  }
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Check X-Data-Source header to detect mock/simulated data mode
    const dataSource = response.headers['x-data-source'];
    if (dataSource !== undefined) {
      const isMock = dataSource === 'mock' || dataSource === 'simulated';
      useDataSourceStore.getState().setMockData(isMock);
      setMockMode(isMock);
    }

    // Check rate limit headers on every successful response
    const limit = Number(response.headers['ratelimit-limit']);
    const remaining = Number(response.headers['ratelimit-remaining']);

    if (limit > 0 && remaining >= 0) {
      const usagePct = remaining / limit;
      if (usagePct < 0.1) {
        console.warn(
          `[Rate Limit] ${remaining}/${limit} requests remaining (${Math.round(usagePct * 100)}%). Consider slowing down.`
        );
      }
    }

    return response.data;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;

    // US-003: 401 retry-with-refresh.
    //
    // Race we're closing: a stale access_token (background-tab clock skew,
    // network sleep, Supabase autoRefreshToken hadn't fired yet) returns
    // 401. Old behavior dropped to mock-data fallback. New behavior:
    //
    //   1. Refresh the session via Supabase (uses the refresh_token).
    //   2. Stamp the request with `_us003RefreshAttempt = true` so we
    //      can't infinite-loop if the refresh succeeded but the token
    //      still 401s (server-side issue, not auth-state issue).
    //   3. Replay the original request with the new Bearer.
    //
    // The replay flag is carried on the per-request axios config, NOT a
    // module-level singleton — concurrent failed requests each get their
    // own one-shot retry. The refresh itself is idempotent at the
    // Supabase layer; multiple concurrent calls coalesce on the SDK side.
    if (
      status === 401 &&
      config &&
      !config._us003RefreshAttempt &&
      // Don't try to refresh the auth/login endpoints themselves.
      !config.url?.includes('/auth/')
    ) {
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && data.session?.access_token) {
          // Persist the new session so subsequent requests pick it up
          // through the request interceptor without another fallback hop.
          useAuthStore.setState({
            session: data.session,
            user: data.session.user,
            isReady: true,
          });
          config._us003RefreshAttempt = true;
          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${data.session.access_token}`;
          return api.request(config);
        }
      } catch {
        // Refresh path itself errored — fall through to the standard
        // error log + reject. Caller will surface unauthed state.
      }
    }

    // US-008: surface the X-Request-Id on errors so console + server logs
    // + Sentry events can be cross-referenced. Header is lower-case on the
    // axios side (Node + browser both normalize). Falls through silently
    // when the header is missing (e.g. CORS preflight, network error).
    const requestId =
      (error.response?.headers as Record<string, string> | undefined)?.['x-request-id'] ||
      (error.response?.headers as Record<string, string> | undefined)?.['X-Request-Id'];
    const url = error.config?.url;
    const method = error.config?.method?.toUpperCase();
    const message = error.response?.data || error.message;
    if (requestId) {
      console.error(
        `API Error [${method} ${url}] status=${status} requestId=${requestId}`,
        message
      );
    } else {
      console.error('API Error:', message);
    }
    return Promise.reject(error);
  }
);

/**
 * Utility to check if an error is a network error (no response from server)
 * vs an API error (server responded with an error status)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    // Network error: no response received (connection refused, timeout, offline)
    return !error.response && (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error' ||
      !navigator.onLine
    );
  }
  return false;
}

/**
 * Utility to check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.code === 'ECONNABORTED' || error.message.includes('timeout');
  }
  return false;
}

/**
 * Get a user-friendly error message from an error
 */
export function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
  if (isTimeoutError(error)) {
    return 'The request timed out. Please try again.';
  }
  if (error instanceof AxiosError && error.response?.data) {
    // Standardized format: { success: false, error: { code, message } }
    if (error.response.data.error?.message) {
      return error.response.data.error.message;
    }
    // Legacy fallback
    if (error.response.data.message) {
      return error.response.data.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
