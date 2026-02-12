import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../lib/auth.js';
import type { UserNotificationSettings } from '../../../src/notifications/AlertDelivery';

// In production, this would be stored in Supabase
// For now, use in-memory store with localStorage sync on client
const settingsStore = new Map<string, UserNotificationSettings>();

// Default settings
const getDefaultSettings = (userId: string): Omit<UserNotificationSettings, 'email'> => ({
  userId,
  emailEnabled: true,
  severityThreshold: 'medium',
  alertTypes: [], // Empty = all types
  digestFrequency: 'immediate',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const start = Date.now();
  const userId = user.id;

  if (req.method === 'GET') {
    // Get current notification settings
    let settings = settingsStore.get(userId);

    if (!settings) {
      settings = {
        ...getDefaultSettings(userId),
        email: '',
      };
    }

    return res.status(200).json({
      success: true,
      data: settings,
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
    });
  }

  if (req.method === 'PUT') {
    // Update notification settings
    const updates = req.body as Partial<UserNotificationSettings>;

    let settings = settingsStore.get(userId);

    if (!settings) {
      settings = {
        ...getDefaultSettings(userId),
        email: updates.email || '',
      };
    }

    // Validate and apply updates
    if (updates.email !== undefined) {
      // Basic email validation
      if (updates.email && !updates.email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Invalid email format' },
        });
      }
      settings.email = updates.email;
    }

    if (updates.emailEnabled !== undefined) {
      settings.emailEnabled = Boolean(updates.emailEnabled);
    }

    if (updates.severityThreshold !== undefined) {
      const validThresholds = ['critical', 'high', 'medium', 'low'];
      if (!validThresholds.includes(updates.severityThreshold)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_THRESHOLD', message: 'Invalid severity threshold' },
        });
      }
      settings.severityThreshold = updates.severityThreshold;
    }

    if (updates.alertTypes !== undefined) {
      if (!Array.isArray(updates.alertTypes)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TYPES', message: 'alertTypes must be an array' },
        });
      }
      settings.alertTypes = updates.alertTypes;
    }

    if (updates.digestFrequency !== undefined) {
      const validFrequencies = ['immediate', 'hourly', 'daily'];
      if (!validFrequencies.includes(updates.digestFrequency)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FREQUENCY', message: 'Invalid digest frequency' },
        });
      }
      settings.digestFrequency = updates.digestFrequency;
    }

    // Save updated settings
    settingsStore.set(userId, settings);

    return res.status(200).json({
      success: true,
      data: settings,
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
    });
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required' },
  });
}
