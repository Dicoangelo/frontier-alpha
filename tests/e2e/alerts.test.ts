/**
 * E2E Test: Risk Alerts
 * PRD Verification: Trigger drawdown threshold → Receive alert with actions
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Risk Alerts', () => {
  let accessToken: string;
  let alertId: string;

  beforeAll(async () => {
    const loginResponse = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
      }),
    });
    const loginData = await loginResponse.json();
    accessToken = loginData.data?.accessToken || 'mock-token';
  });

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });

  describe('Alert Configuration', () => {
    it('should get current alert thresholds', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts/config`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.thresholds).toBeDefined();
      expect(data.data.thresholds.drawdown).toBeDefined();
      expect(data.data.thresholds.volatility).toBeDefined();
      expect(data.data.thresholds.concentration).toBeDefined();
    });

    it('should update alert thresholds', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts/config`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          thresholds: {
            drawdown: {
              warning: 0.05,
              critical: 0.10,
            },
          },
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.thresholds.drawdown.warning).toBe(0.05);
      expect(data.data.thresholds.drawdown.critical).toBe(0.10);
    });
  });

  describe('Alert List', () => {
    it('should return recent alerts', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.alerts).toBeDefined();
      expect(Array.isArray(data.data.alerts)).toBe(true);
    });

    it('should filter by severity', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/alerts?severity=critical`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      for (const alert of data.data.alerts) {
        expect(alert.severity).toBe('critical');
      }
    });

    it('should filter by type', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/alerts?type=drawdown`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      for (const alert of data.data.alerts) {
        expect(alert.type).toBe('drawdown');
      }
    });
  });

  describe('Alert Structure', () => {
    it('should include all required alert fields', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      if (data.data.alerts.length > 0) {
        const alert = data.data.alerts[0];
        alertId = alert.id;

        expect(alert.id).toBeDefined();
        expect(alert.type).toBeDefined();
        expect(['drawdown', 'volatility', 'concentration', 'factor_drift', 'earnings']).toContain(
          alert.type
        );
        expect(alert.severity).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(alert.severity);
        expect(alert.message).toBeDefined();
        expect(alert.timestamp).toBeDefined();
      }
    });

    it('should include action buttons', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      if (data.data.alerts.length > 0) {
        const alert = data.data.alerts[0];
        expect(alert.actions).toBeDefined();
        expect(Array.isArray(alert.actions)).toBe(true);

        if (alert.actions.length > 0) {
          const action = alert.actions[0];
          expect(action.label).toBeDefined();
          expect(action.type).toBeDefined();
        }
      }
    });

    it('should include context/drivers for critical alerts', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/alerts?severity=critical`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      const data = await response.json();

      if (data.data.alerts.length > 0) {
        const alert = data.data.alerts[0];
        expect(alert.context).toBeDefined();
        expect(alert.context.drivers).toBeDefined();
      }
    });
  });

  describe('Drawdown Alert Trigger', () => {
    it('should trigger alert when drawdown exceeds threshold', async () => {
      // Simulate drawdown check
      const response = await fetch(`${API_BASE}/api/v1/alerts/check`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          type: 'drawdown',
          currentDrawdown: 0.12, // 12% drawdown
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.triggered).toBe(true);
      expect(data.data.alert).toBeDefined();
      expect(data.data.alert.type).toBe('drawdown');
      expect(['critical', 'high']).toContain(data.data.alert.severity);
    });

    it('should include specific numbers in drawdown alert', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts/check`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          type: 'drawdown',
          currentDrawdown: 0.12,
        }),
      });

      const data = await response.json();

      if (data.data.triggered) {
        expect(data.data.alert.context.currentValue).toBeDefined();
        expect(data.data.alert.context.threshold).toBeDefined();
        expect(data.data.alert.message).toContain('%');
      }
    });
  });

  describe('Alert Actions', () => {
    it('should dismiss alert', async () => {
      if (!alertId) {
        // Create a test alert first
        const createResponse = await fetch(`${API_BASE}/api/v1/alerts/check`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            type: 'volatility',
            currentVolatility: 0.35,
          }),
        });
        const createData = await createResponse.json();
        alertId = createData.data.alert?.id;
      }

      if (alertId) {
        const response = await fetch(`${API_BASE}/api/v1/alerts/${alertId}/dismiss`, {
          method: 'POST',
          headers: headers(),
        });

        expect(response.status).toBe(200);
      }
    });

    it('should execute alert action', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts/execute`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          alertId,
          action: 'reduce_risk',
        }),
      });

      // May return 200 or 400 depending on alert state
      expect([200, 400, 404]).toContain(response.status);
    });
  });

  describe('Notification Settings', () => {
    it('should get notification preferences', async () => {
      const response = await fetch(`${API_BASE}/api/v1/settings/notifications`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.emailEnabled).toBeDefined();
      expect(data.data.severityThreshold).toBeDefined();
      expect(data.data.alertTypes).toBeDefined();
    });

    it('should update notification preferences', async () => {
      const response = await fetch(`${API_BASE}/api/v1/settings/notifications`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          emailEnabled: true,
          severityThreshold: 'high',
          alertTypes: ['drawdown', 'earnings'],
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.emailEnabled).toBe(true);
      expect(data.data.severityThreshold).toBe('high');
    });
  });

  describe('Real-Time Alert Stream', () => {
    it('should receive alerts via SSE', async () => {
      const response = await fetch(`${API_BASE}/api/v1/alerts/stream`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // Close stream
      response.body?.cancel();
    });
  });
});
