import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AlertDelivery, type AlertPayload, type UserNotificationSettings } from '../../../src/notifications/AlertDelivery';

// Temporary in-memory store for user settings (should be in database)
const userSettingsStore = new Map<string, UserNotificationSettings>();

// Default settings for demo
const getDefaultSettings = (userId: string, email: string): UserNotificationSettings => ({
  userId,
  email,
  emailEnabled: true,
  severityThreshold: 'medium',
  alertTypes: [], // Empty = all types
  digestFrequency: 'immediate',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' },
    });
  }

  const start = Date.now();

  try {
    const {
      alerts,
      userId,
      email,
      mode = 'immediate', // 'immediate' or 'digest'
      settings: customSettings,
    } = req.body as {
      alerts: AlertPayload[];
      userId?: string;
      email?: string;
      mode?: 'immediate' | 'digest';
      settings?: Partial<UserNotificationSettings>;
    };

    // Validate input
    if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'alerts array required' },
      });
    }

    if (!email && !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'email or userId required' },
      });
    }

    // Get or create user settings
    const effectiveUserId = userId || email || 'anonymous';
    let settings = userSettingsStore.get(effectiveUserId);

    if (!settings) {
      settings = getDefaultSettings(effectiveUserId, email || '');
    }

    // Apply custom settings if provided
    if (customSettings) {
      settings = { ...settings, ...customSettings };
    }

    if (!settings.email && email) {
      settings.email = email;
    }

    if (!settings.email) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'No email address configured' },
      });
    }

    // Initialize delivery service
    const delivery = new AlertDelivery({
      provider: (process.env.EMAIL_PROVIDER as 'resend' | 'sendgrid' | 'console') || 'console',
      apiKey: process.env.EMAIL_API_KEY,
      fromEmail: process.env.EMAIL_FROM,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });

    const results: Array<{ alertId: string; success: boolean; messageId?: string; error?: string }> = [];

    if (mode === 'digest') {
      // Send all alerts as a digest
      const result = await delivery.sendDigest(alerts, settings);
      results.push({
        alertId: 'digest',
        ...result,
      });
    } else {
      // Send each alert immediately
      for (const alert of alerts) {
        const result = await delivery.sendAlert(alert, settings);
        results.push({
          alertId: alert.id,
          ...result,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      data: {
        sent: successCount,
        failed: failCount,
        results,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
        mode,
      },
    });
  } catch (error) {
    console.error('Alert notification error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to send notifications',
      },
    });
  }
}
