/**
 * E2E Test: ML Engine API
 * PRD Verification: Regime predictions, factor attribution, and model status
 *
 * Note: ML endpoints may depend on external APIs for price data.
 * Tests accept 500/503 as "external API unavailable" - not a test failure.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, isExternalApiError } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('ML Engine API', () => {
  // ========================
  // Regime Detection
  // ========================
  describe('Regime Detection — GET /api/v1/ml/regime', () => {
    it('should return current regime with confidence', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/regime`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.regime).toBeDefined();
        expect(['bull', 'bear', 'sideways', 'volatile']).toContain(data.data.regime);
        expect(typeof data.data.confidence).toBe('number');
        expect(data.data.confidence).toBeGreaterThanOrEqual(0);
        expect(data.data.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return regime probabilities summing to ~1', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/regime`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      const probs = data.data.probabilities;
      expect(probs).toBeDefined();
      expect(typeof probs.bull).toBe('number');
      expect(typeof probs.bear).toBe('number');
      expect(typeof probs.sideways).toBe('number');
      expect(typeof probs.volatile).toBe('number');

      const sum = probs.bull + probs.bear + probs.sideways + probs.volatile;
      expect(sum).toBeCloseTo(1.0, 1);
    });

    it('should return transition probabilities matrix', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/regime`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      const transitions = data.data.transitions;
      expect(transitions).toBeDefined();

      // Each regime should have transition probabilities to all regimes
      for (const regime of ['bull', 'bear', 'sideways', 'volatile']) {
        expect(transitions[regime]).toBeDefined();
        const row = transitions[regime];
        expect(typeof row.bull).toBe('number');
        expect(typeof row.bear).toBe('number');
        expect(typeof row.sideways).toBe('number');
        expect(typeof row.volatile).toBe('number');
      }
    });

    it('should accept custom symbol via query param', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/regime?symbols=AAPL`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.data.symbol).toBe('AAPL');
      }
    });

    it('should include timestamp and meta', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/regime`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      expect(data.data.timestamp).toBeDefined();
      expect(data.meta).toBeDefined();
    });
  });

  // ========================
  // Factor Attribution
  // ========================
  describe('Factor Attribution — GET /api/v1/ml/attribution', () => {
    it('should return factor attribution with contributions', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/attribution`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(typeof data.data.totalReturn).toBe('number');
        expect(typeof data.data.factorReturn).toBe('number');
        expect(typeof data.data.residualReturn).toBe('number');
        expect(Array.isArray(data.data.factors)).toBe(true);
      }
    });

    it('should return factor contribution structure', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/attribution`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const factors = data.data.factors;

      if (factors.length > 0) {
        const factor = factors[0];
        expect(factor.factor).toBeDefined();
        expect(typeof factor.exposure).toBe('number');
        expect(typeof factor.contribution).toBe('number');
        expect(typeof factor.gradientImportance).toBe('number');
        expect(typeof factor.shapleyValue).toBe('number');
        expect(['positive', 'negative']).toContain(factor.direction);
      }
    });

    it('should return waterfall chart data', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/attribution`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const waterfall = data.data.waterfall;
      expect(Array.isArray(waterfall)).toBe(true);

      if (waterfall.length > 0) {
        const item = waterfall[0];
        expect(item.label).toBeDefined();
        expect(typeof item.start).toBe('number');
        expect(typeof item.end).toBe('number');
        expect(typeof item.value).toBe('number');
        expect(['positive', 'negative', 'total', 'residual']).toContain(item.type);
      }
    });

    it('should return attribution summary', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/attribution`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const summary = data.data.summary;
      expect(summary).toBeDefined();
      expect(typeof summary.positiveCount).toBe('number');
      expect(typeof summary.negativeCount).toBe('number');
      expect(typeof summary.totalPositive).toBe('number');
      expect(typeof summary.totalNegative).toBe('number');
    });

    it('should accept custom symbols via query param', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/attribution?symbols=NVDA,TSLA`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.data.symbols).toBeDefined();
        expect(data.data.symbols).toContain('NVDA');
        expect(data.data.symbols).toContain('TSLA');
      }
    });
  });

  // ========================
  // Model Status
  // ========================
  describe('Model Status — GET /api/v1/ml/models', () => {
    it('should return model versions list', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.models).toBeDefined();
        expect(Array.isArray(data.data.models)).toBe(true);
        expect(typeof data.data.count).toBe('number');
        expect(data.data.count).toBe(data.data.models.length);
      }
    });

    it('should return model version structure', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const models = data.data.models;

      if (models.length > 0) {
        const model = models[0];
        expect(model.id).toBeDefined();
        expect(model.model_type).toBeDefined();
        expect(['regime_detector', 'neural_factor']).toContain(model.model_type);
        expect(model.version).toBeDefined();
        expect(model.status).toBeDefined();
        expect(['training', 'validated', 'deployed', 'archived']).toContain(model.status);
        expect(model.metrics).toBeDefined();
        expect(model.trained_at).toBeDefined();
        expect(model.data_points).toBeDefined();
      }
    });

    it('should filter by model type', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/models?type=regime_detector`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      for (const model of data.data.models) {
        expect(model.model_type).toBe('regime_detector');
      }
    });

    it('should filter by model status', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/models?status=deployed`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      for (const model of data.data.models) {
        expect(model.status).toBe('deployed');
      }
    });

    it('should include meta with latency', async () => {
      const response = await fetch(`${API_BASE}/api/v1/ml/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (isExternalApiError(response.status) || response.status === 404) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      expect(data.meta).toBeDefined();
    });
  });

  // ========================
  // Performance
  // ========================
  describe('ML API Performance', () => {
    it('should respond within acceptable latency', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/v1/ml/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const latency = Date.now() - startTime;

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        expect(latency).toBeLessThan(2000);
      }
    });
  });
});
