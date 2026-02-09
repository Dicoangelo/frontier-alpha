/**
 * AlertDelivery - Multi-channel notification service for risk alerts
 *
 * Channels:
 * - Email (Resend, SendGrid, or console for dev)
 * - Push notifications (Web Push via PushService)
 *
 * Supports multiple email providers:
 * - Resend (recommended for simplicity)
 * - SendGrid (enterprise alternative)
 */

import { getPushService, type PushNotificationPayload } from './PushService.js';

export interface AlertPayload {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
  symbol?: string;
  value?: number;
  threshold?: number;
  actions?: Array<{
    label: string;
    url?: string;
  }>;
}

export interface UserNotificationSettings {
  userId: string;
  email: string;
  emailEnabled: boolean;
  pushEnabled?: boolean;
  severityThreshold: 'critical' | 'high' | 'medium' | 'low';
  alertTypes: string[];
  digestFrequency: 'immediate' | 'hourly' | 'daily';
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Resend API response
interface ResendResponse {
  id?: string;
  error?: string;
}

// Provider interface
interface EmailProvider {
  send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// Resend provider
class ResendProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string = 'alerts@frontier-alpha.com') {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Resend error: ${error}` };
      }

      const data: ResendResponse = await response.json();
      return { success: true, messageId: data.id };
    } catch (error) {
      return { success: false, error: `Resend failed: ${error}` };
    }
  }
}

// SendGrid provider
class SendGridProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string = 'alerts@frontier-alpha.com') {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: this.fromEmail },
          subject: payload.subject,
          content: [
            { type: 'text/html', value: payload.html },
            ...(payload.text ? [{ type: 'text/plain', value: payload.text }] : []),
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `SendGrid error: ${error}` };
      }

      // SendGrid returns message ID in headers
      const messageId = response.headers.get('X-Message-Id') || undefined;
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: `SendGrid failed: ${error}` };
    }
  }
}

// Console provider for development
class ConsoleProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log('\n📧 [AlertDelivery] Email notification:');
    console.log(`   To: ${payload.to}`);
    console.log(`   Subject: ${payload.subject}`);
    console.log(`   Preview: ${payload.text?.slice(0, 100)}...`);
    return { success: true, messageId: `console-${Date.now()}` };
  }
}

export class AlertDelivery {
  private provider: EmailProvider;
  private fromEmail: string;
  private appUrl: string;

  constructor(config?: {
    provider?: 'resend' | 'sendgrid' | 'console';
    apiKey?: string;
    fromEmail?: string;
    appUrl?: string;
  }) {
    const providerType = config?.provider || process.env.EMAIL_PROVIDER || 'console';
    const apiKey = config?.apiKey || process.env.EMAIL_API_KEY || '';
    this.fromEmail = config?.fromEmail || process.env.EMAIL_FROM || 'alerts@frontier-alpha.com';
    this.appUrl = config?.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://frontier-alpha.com';

    switch (providerType) {
      case 'resend':
        this.provider = new ResendProvider(apiKey, this.fromEmail);
        break;
      case 'sendgrid':
        this.provider = new SendGridProvider(apiKey, this.fromEmail);
        break;
      default:
        this.provider = new ConsoleProvider();
    }
  }

  /**
   * Send a single alert notification via all enabled channels (email + push).
   */
  async sendAlert(
    alert: AlertPayload,
    settings: UserNotificationSettings
  ): Promise<{ success: boolean; messageId?: string; error?: string; pushResults?: Array<{ success: boolean; error?: string }> }> {
    // Check severity threshold (applies to all channels)
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const alertSeverityIndex = severityOrder.indexOf(alert.severity);
    const thresholdIndex = severityOrder.indexOf(settings.severityThreshold);
    if (alertSeverityIndex < thresholdIndex) {
      return { success: true, messageId: 'skipped-below-threshold' };
    }

    // Check alert type filter (applies to all channels)
    if (settings.alertTypes.length > 0 && !settings.alertTypes.includes(alert.type)) {
      return { success: true, messageId: 'skipped-type-filtered' };
    }

    // --- Email delivery ---
    let emailResult: { success: boolean; messageId?: string; error?: string } = {
      success: true,
      messageId: 'skipped-disabled',
    };

    if (settings.emailEnabled) {
      const subject = this.formatSubject(alert);
      const html = this.formatHtmlEmail(alert);
      const text = this.formatTextEmail(alert);

      emailResult = await this.provider.send({
        to: settings.email,
        subject,
        html,
        text,
      });
    }

    // --- Push notification delivery ---
    let pushResults: Array<{ success: boolean; error?: string }> | undefined;

    if (settings.pushEnabled !== false) {
      pushResults = await this.sendPushForAlert(alert, settings.userId);
    }

    return {
      ...emailResult,
      pushResults,
    };
  }

  /**
   * Send a digest of multiple alerts via all enabled channels (email + push).
   */
  async sendDigest(
    alerts: AlertPayload[],
    settings: UserNotificationSettings
  ): Promise<{ success: boolean; messageId?: string; error?: string; pushResults?: Array<{ success: boolean; error?: string }> }> {
    if (alerts.length === 0) {
      return { success: true, messageId: 'skipped' };
    }

    // --- Email digest ---
    let emailResult: { success: boolean; messageId?: string; error?: string } = {
      success: true,
      messageId: 'skipped-disabled',
    };

    if (settings.emailEnabled) {
      const subject = `Frontier Alpha: ${alerts.length} Alert${alerts.length > 1 ? 's' : ''} Summary`;
      const html = this.formatDigestHtml(alerts);
      const text = this.formatDigestText(alerts);

      emailResult = await this.provider.send({
        to: settings.email,
        subject,
        html,
        text,
      });
    }

    // --- Push digest notification ---
    let pushResults: Array<{ success: boolean; error?: string }> | undefined;

    if (settings.pushEnabled !== false) {
      try {
        const pushService = getPushService();
        if (pushService.hasSubscriptions(settings.userId)) {
          const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
          const highCount = alerts.filter((a) => a.severity === 'high').length;

          let body = `${alerts.length} alert${alerts.length > 1 ? 's' : ''} require your attention.`;
          if (criticalCount > 0) {
            body = `${criticalCount} critical, ${highCount} high priority. ${body}`;
          }

          const results = await pushService.broadcastToUser(settings.userId, {
            title: `Frontier Alpha: Alert Digest`,
            body,
            tag: `digest-${Date.now()}`,
            data: { url: '/alerts', type: 'digest' },
            actions: [
              { action: 'view', title: 'View All' },
              { action: 'dismiss', title: 'Dismiss' },
            ],
          });

          pushResults = results.map((r) => ({
            success: r.success,
            error: r.error,
          }));
        }
      } catch (error) {
        console.error('[AlertDelivery] Push digest notification failed:', error);
        pushResults = [
          {
            success: false,
            error: error instanceof Error ? error.message : 'Push delivery failed',
          },
        ];
      }
    }

    return {
      ...emailResult,
      pushResults,
    };
  }

  /**
   * Send a push notification for an alert via PushService.
   * Fails gracefully if push is unavailable or user has no subscriptions.
   */
  private async sendPushForAlert(
    alert: AlertPayload,
    userId: string
  ): Promise<Array<{ success: boolean; error?: string }>> {
    try {
      const pushService = getPushService();

      if (!pushService.hasSubscriptions(userId)) {
        return [{ success: true, error: 'no-push-subscriptions' }];
      }

      const severityLabel: Record<string, string> = {
        critical: 'CRITICAL',
        high: 'HIGH',
        medium: 'MEDIUM',
        low: 'LOW',
      };

      const payload: PushNotificationPayload = {
        title: `${severityLabel[alert.severity] || 'ALERT'}: ${alert.title}`,
        body: alert.message,
        tag: `alert-${alert.type}-${alert.symbol || alert.id}`,
        data: {
          url: alert.symbol ? `/portfolio?highlight=${alert.symbol}` : '/alerts',
          type: alert.type,
        },
        actions: [
          { action: 'view', title: 'View Details' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      };

      const results = await pushService.broadcastToUser(userId, payload);
      return results.map((r) => ({
        success: r.success,
        error: r.error,
      }));
    } catch (error) {
      console.error('[AlertDelivery] Push notification failed:', error);
      return [
        {
          success: false,
          error: error instanceof Error ? error.message : 'Push delivery failed',
        },
      ];
    }
  }

  private formatSubject(alert: AlertPayload): string {
    const severityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
    }[alert.severity];

    return `${severityEmoji} ${alert.title}${alert.symbol ? ` - ${alert.symbol}` : ''}`;
  }

  private formatHtmlEmail(alert: AlertPayload): string {
    const severityColors = {
      critical: '#EF4444',
      high: '#F97316',
      medium: '#EAB308',
      low: '#3B82F6',
    };

    const severityColor = severityColors[alert.severity];

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${alert.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3B82F6, #8B5CF6); padding: 20px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Frontier Alpha</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0;">Portfolio Intelligence Alert</p>
  </div>

  <div style="background: white; padding: 24px; border: 1px solid #E5E7EB; border-top: none;">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
      <span style="background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
        ${alert.severity}
      </span>
      ${alert.symbol ? `<span style="color: #6B7280; font-size: 14px;">${alert.symbol}</span>` : ''}
    </div>

    <h2 style="color: #111827; margin: 0 0 12px; font-size: 20px;">
      ${alert.title}
    </h2>

    <p style="color: #4B5563; margin: 0 0 20px;">
      ${alert.message}
    </p>

    ${alert.value !== undefined && alert.threshold !== undefined ? `
    <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #6B7280;">Current Value</span>
        <span style="font-weight: 600; color: ${severityColor};">${typeof alert.value === 'number' ? (alert.value * 100).toFixed(2) + '%' : alert.value}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 8px;">
        <span style="color: #6B7280;">Threshold</span>
        <span style="color: #374151;">${typeof alert.threshold === 'number' ? (alert.threshold * 100).toFixed(2) + '%' : alert.threshold}</span>
      </div>
    </div>
    ` : ''}

    ${alert.actions && alert.actions.length > 0 ? `
    <div style="margin-top: 24px;">
      <p style="color: #6B7280; font-size: 14px; margin: 0 0 12px;">Suggested Actions:</p>
      ${alert.actions.map(action => `
        <a href="${action.url || this.appUrl + '/alerts'}" style="display: inline-block; background: #3B82F6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-right: 8px; margin-bottom: 8px;">
          ${action.label}
        </a>
      `).join('')}
    </div>
    ` : ''}

    <a href="${this.appUrl}/alerts" style="display: inline-block; margin-top: 24px; color: #3B82F6; text-decoration: none; font-weight: 500;">
      View in Dashboard →
    </a>
  </div>

  <div style="background: #F9FAFB; padding: 16px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
      ${new Date(alert.timestamp).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })}
    </p>
    <p style="color: #9CA3AF; font-size: 12px; margin: 8px 0 0;">
      <a href="${this.appUrl}/settings/notifications" style="color: #9CA3AF;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>`;
  }

  private formatTextEmail(alert: AlertPayload): string {
    return `
FRONTIER ALPHA - ${alert.severity.toUpperCase()} ALERT

${alert.title}${alert.symbol ? ` (${alert.symbol})` : ''}

${alert.message}

${alert.value !== undefined && alert.threshold !== undefined ? `
Current Value: ${typeof alert.value === 'number' ? (alert.value * 100).toFixed(2) + '%' : alert.value}
Threshold: ${typeof alert.threshold === 'number' ? (alert.threshold * 100).toFixed(2) + '%' : alert.threshold}
` : ''}

View in dashboard: ${this.appUrl}/alerts

---
${new Date(alert.timestamp).toLocaleString()}
Manage preferences: ${this.appUrl}/settings/notifications
`.trim();
  }

  private formatDigestHtml(alerts: AlertPayload[]): string {
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const highCount = alerts.filter(a => a.severity === 'high').length;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3B82F6, #8B5CF6); padding: 20px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Frontier Alpha</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0;">Alert Digest - ${alerts.length} notification${alerts.length > 1 ? 's' : ''}</p>
  </div>

  <div style="background: white; padding: 24px; border: 1px solid #E5E7EB; border-top: none;">
    <div style="display: flex; gap: 16px; margin-bottom: 24px;">
      ${criticalCount > 0 ? `<span style="background: #FEE2E2; color: #991B1B; padding: 8px 16px; border-radius: 8px; font-weight: 600;">${criticalCount} Critical</span>` : ''}
      ${highCount > 0 ? `<span style="background: #FFEDD5; color: #9A3412; padding: 8px 16px; border-radius: 8px; font-weight: 600;">${highCount} High</span>` : ''}
    </div>

    ${alerts.map(alert => {
      const severityColors = {
        critical: '#EF4444',
        high: '#F97316',
        medium: '#EAB308',
        low: '#3B82F6',
      };
      return `
      <div style="border-left: 4px solid ${severityColors[alert.severity]}; padding: 12px 16px; margin-bottom: 16px; background: #F9FAFB; border-radius: 0 8px 8px 0;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${alert.title}</div>
        <div style="color: #6B7280; font-size: 14px;">${alert.message}</div>
      </div>
      `;
    }).join('')}

    <a href="${this.appUrl}/alerts" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px;">
      View All Alerts
    </a>
  </div>

  <div style="background: #F9FAFB; padding: 16px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
      <a href="${this.appUrl}/settings/notifications" style="color: #9CA3AF;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>`;
  }

  private formatDigestText(alerts: AlertPayload[]): string {
    return `
FRONTIER ALPHA - ALERT DIGEST

${alerts.length} alert${alerts.length > 1 ? 's' : ''} require your attention:

${alerts.map(alert => `
[${alert.severity.toUpperCase()}] ${alert.title}
${alert.message}
`).join('\n')}

View all alerts: ${this.appUrl}/alerts

---
Manage preferences: ${this.appUrl}/settings/notifications
`.trim();
  }
}
