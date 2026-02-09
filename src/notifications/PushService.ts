/**
 * PushService - Server-side push notification service
 *
 * Uses the web-push npm package to send push notifications via the Web Push protocol.
 * Manages VAPID keys, subscription storage, and notification delivery.
 *
 * Required env vars:
 * - VAPID_PUBLIC_KEY: Base64url-encoded VAPID public key
 * - VAPID_PRIVATE_KEY: Base64url-encoded VAPID private key
 * - WEB_PUSH_SUBJECT: mailto: or https: URL identifying the application server
 *
 * If VAPID keys are not set, they will be generated at runtime and logged
 * so the developer can persist them in environment configuration.
 *
 * Note: Requires `web-push` package — npm install web-push
 */

// web-push is a CommonJS module; use dynamic import or require depending on environment
let webpush: typeof import('web-push') | null = null;

async function getWebPush(): Promise<typeof import('web-push')> {
  if (webpush) return webpush;
  try {
    webpush = await import('web-push');
    return webpush;
  } catch {
    throw new Error(
      'web-push package not installed. Run: npm install web-push'
    );
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    [key: string]: unknown;
  };
  tag?: string;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface PushDeliveryResult {
  success: boolean;
  endpoint?: string;
  statusCode?: number;
  error?: string;
}

// ============================================================================
// In-memory subscription store
// ============================================================================

// Map<userId, PushSubscriptionData[]>
const subscriptionStore = new Map<string, PushSubscriptionData[]>();

// Reverse lookup: endpoint -> userId (for unsubscribe by endpoint)
const endpointToUser = new Map<string, string>();

// ============================================================================
// VAPID configuration
// ============================================================================

let vapidConfigured = false;

async function ensureVapidConfigured(): Promise<void> {
  if (vapidConfigured) return;

  const wp = await getWebPush();

  let publicKey = process.env.VAPID_PUBLIC_KEY || '';
  let privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:admin@frontier-alpha.com';

  if (!publicKey || !privateKey) {
    // Generate keys at runtime and log them for the developer to persist
    const generated = wp.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;

    console.warn(
      '\n[PushService] VAPID keys not found in environment. Generated new keys.\n' +
        'Add these to your .env file:\n\n' +
        `VAPID_PUBLIC_KEY=${publicKey}\n` +
        `VAPID_PRIVATE_KEY=${privateKey}\n` +
        `WEB_PUSH_SUBJECT=${subject}\n`
    );
  }

  wp.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

// ============================================================================
// PushService
// ============================================================================

export class PushService {
  // --------------------------------------------------------------------------
  // Subscription management
  // --------------------------------------------------------------------------

  /**
   * Store a push subscription for a user.
   * Replaces any existing subscription with the same endpoint.
   */
  addSubscription(userId: string, subscription: PushSubscriptionData): void {
    const existing = subscriptionStore.get(userId) || [];

    // Remove duplicate endpoint if present
    const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
    filtered.push(subscription);

    subscriptionStore.set(userId, filtered);
    endpointToUser.set(subscription.endpoint, userId);
  }

  /**
   * Remove a subscription by endpoint.
   * Returns true if the subscription was found and removed.
   */
  removeSubscription(endpoint: string): boolean {
    const userId = endpointToUser.get(endpoint);
    if (!userId) return false;

    const subscriptions = subscriptionStore.get(userId) || [];
    const filtered = subscriptions.filter((s) => s.endpoint !== endpoint);

    if (filtered.length === 0) {
      subscriptionStore.delete(userId);
    } else {
      subscriptionStore.set(userId, filtered);
    }

    endpointToUser.delete(endpoint);
    return true;
  }

  /**
   * Get all subscriptions for a user.
   */
  getSubscriptions(userId: string): PushSubscriptionData[] {
    return subscriptionStore.get(userId) || [];
  }

  /**
   * Check if a user has any active subscriptions.
   */
  hasSubscriptions(userId: string): boolean {
    const subs = subscriptionStore.get(userId);
    return !!subs && subs.length > 0;
  }

  // --------------------------------------------------------------------------
  // Push notification sending
  // --------------------------------------------------------------------------

  /**
   * Send a push notification to a single subscription.
   * Handles expired/invalid subscriptions by removing them from the store.
   */
  async sendPushNotification(
    subscription: PushSubscriptionData,
    payload: PushNotificationPayload
  ): Promise<PushDeliveryResult> {
    try {
      await ensureVapidConfigured();
      const wp = await getWebPush();

      // Build the full notification payload including defaults
      const fullPayload: PushNotificationPayload = {
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        ...payload,
        actions: payload.actions || [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      };

      const result = await wp.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        JSON.stringify(fullPayload),
        {
          TTL: 60 * 60, // 1 hour
          urgency: 'high',
        }
      );

      return {
        success: true,
        endpoint: subscription.endpoint,
        statusCode: result.statusCode,
      };
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };

      // 404 or 410 means the subscription is expired/invalid
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(
          `[PushService] Subscription expired (${err.statusCode}), removing:`,
          subscription.endpoint.slice(0, 60) + '...'
        );
        this.removeSubscription(subscription.endpoint);
      }

      return {
        success: false,
        endpoint: subscription.endpoint,
        statusCode: err.statusCode,
        error: err.message || 'Unknown push error',
      };
    }
  }

  /**
   * Broadcast a notification to all subscriptions for a user.
   * Returns results for each subscription attempt.
   */
  async broadcastToUser(
    userId: string,
    notification: PushNotificationPayload
  ): Promise<PushDeliveryResult[]> {
    const subscriptions = this.getSubscriptions(userId);

    if (subscriptions.length === 0) {
      return [
        {
          success: false,
          error: `No push subscriptions found for user ${userId}`,
        },
      ];
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendPushNotification(sub, notification))
    );

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        success: false,
        error: result.reason?.message || 'Push delivery failed',
      };
    });
  }

  // --------------------------------------------------------------------------
  // Domain-specific notification helpers
  // --------------------------------------------------------------------------

  /**
   * Send a price alert push notification.
   */
  async sendPriceAlert(
    userId: string,
    symbol: string,
    price: number,
    threshold: number
  ): Promise<PushDeliveryResult[]> {
    const direction = price >= threshold ? 'above' : 'below';
    const formattedPrice = price.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    const formattedThreshold = threshold.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    return this.broadcastToUser(userId, {
      title: `Price Alert: ${symbol}`,
      body: `${symbol} is ${direction} your threshold at ${formattedPrice} (threshold: ${formattedThreshold})`,
      tag: `price-alert-${symbol}`,
      data: {
        url: `/portfolio?highlight=${symbol}`,
        type: 'price_alert',
        symbol,
        price,
        threshold,
      },
      actions: [
        { action: 'view', title: 'View Portfolio' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  }

  /**
   * Send an earnings alert push notification.
   */
  async sendEarningsAlert(
    userId: string,
    symbol: string,
    reportDate: string
  ): Promise<PushDeliveryResult[]> {
    return this.broadcastToUser(userId, {
      title: `Earnings Alert: ${symbol}`,
      body: `${symbol} earnings report scheduled for ${reportDate}. Review your position and prepare.`,
      tag: `earnings-alert-${symbol}`,
      data: {
        url: `/earnings?symbol=${symbol}`,
        type: 'earnings_alert',
        symbol,
        reportDate,
      },
      actions: [
        { action: 'view', title: 'View Earnings' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  }

  /**
   * Send a risk alert push notification.
   */
  async sendRiskAlert(
    userId: string,
    alertType: string,
    message: string
  ): Promise<PushDeliveryResult[]> {
    return this.broadcastToUser(userId, {
      title: `Risk Alert: ${alertType}`,
      body: message,
      tag: `risk-alert-${alertType}`,
      data: {
        url: '/alerts',
        type: 'risk_alert',
        alertType,
      },
      actions: [
        { action: 'view', title: 'View Alerts' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let pushServiceInstance: PushService | null = null;

export function getPushService(): PushService {
  if (!pushServiceInstance) {
    pushServiceInstance = new PushService();
  }
  return pushServiceInstance;
}
