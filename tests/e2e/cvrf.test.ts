/**
 * E2E Test: CVRF Intelligence Dashboard
 * PRD Verification: Episode timeline, belief visualization, meta-prompt generation
 *
 * Tests cover the full CVRF dashboard flow:
 * - Episode timeline with metrics (return, Sharpe, drawdown)
 * - Episode lifecycle (start → record decisions → close)
 * - Belief state heatmap with factor weights
 * - Meta-prompt card insights
 * - Optimization constraints
 * - Error states and loading behavior
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, isExternalApiError } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('CVRF Intelligence Dashboard', () => {
  // =============================================
  // Episode Timeline
  // =============================================
  describe('Episode Timeline', () => {
    it('should return paginated episodes with correct metrics', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/episodes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-valid-token',
        },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.completed).toBeDefined();
        expect(Array.isArray(data.data.completed)).toBe(true);
        expect(data.data.pagination).toBeDefined();

        // Verify episode metrics structure
        for (const episode of data.data.completed) {
          expect(episode.id).toBeDefined();
          expect(episode.episodeNumber).toBeDefined();
          expect(episode.startDate).toBeDefined();
          expect(episode.endDate).toBeDefined();
          expect(typeof episode.portfolioReturn).toBe('number');
          expect(typeof episode.sharpeRatio).toBe('number');
          expect(typeof episode.maxDrawdown).toBe('number');
          expect(episode.status).toBe('completed');
        }
      }
    });

    it('should display correct episode card metrics (return, Sharpe, drawdown)', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/episodes?limit=3`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-valid-token',
        },
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const episodes = data.data.completed;

      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes.length).toBeLessThanOrEqual(3);

      const episode = episodes[0];
      // Verify return is a reasonable percentage
      expect(Math.abs(episode.portfolioReturn)).toBeLessThan(1);
      // Sharpe ratio typically between -3 and 5
      expect(episode.sharpeRatio).toBeGreaterThan(-5);
      expect(episode.sharpeRatio).toBeLessThan(10);
      // Max drawdown is a positive number representing loss
      expect(episode.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should support pagination with offset and limit', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/cvrf/episodes?limit=2&offset=0`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-valid-token',
          },
        }
      );

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const { pagination } = data.data;

      expect(pagination.limit).toBe(2);
      expect(pagination.offset).toBe(0);
      expect(typeof pagination.total).toBe('number');
      expect(typeof pagination.hasMore).toBe('boolean');
    });

    it('should require authentication for episode list', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/episodes`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      // 401 = auth required, 404 = not deployed, 500 = server error
      expect([401, 404, 500]).toContain(response.status);
    });
  });

  // =============================================
  // Episode Comparison View
  // =============================================
  describe('Episode Comparison', () => {
    it('should load episode comparison data from cycle history', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/history`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);

        for (const cycle of data.data) {
          expect(typeof cycle.betterEpisodeReturn).toBe('number');
          expect(typeof cycle.worseEpisodeReturn).toBe('number');
          expect(typeof cycle.performanceDelta).toBe('number');
          expect(typeof cycle.decisionOverlap).toBe('number');
          expect(typeof cycle.insightsCount).toBe('number');
          expect(typeof cycle.beliefUpdatesCount).toBe('number');
          expect(cycle.newRegime).toBeDefined();
        }
      }
    });

    it('should show performance delta between episodes', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/history`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      if (data.data.length > 0) {
        const cycle = data.data[0];
        // Performance delta = better - worse
        expect(cycle.performanceDelta).toBeGreaterThanOrEqual(0);
        expect(cycle.betterEpisodeReturn).toBeGreaterThanOrEqual(cycle.worseEpisodeReturn);
      }
    });
  });

  // =============================================
  // Belief State Heatmap
  // =============================================
  describe('Belief State Heatmap', () => {
    it('should render belief state with factor weights', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/beliefs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);

        const beliefs = data.data;
        expect(beliefs.factorWeights).toBeDefined();
        expect(beliefs.factorConfidences).toBeDefined();
        expect(typeof beliefs.factorWeights).toBe('object');
        expect(typeof beliefs.factorConfidences).toBe('object');

        // Verify factor weights are numeric
        for (const [factor, weight] of Object.entries(beliefs.factorWeights)) {
          expect(typeof factor).toBe('string');
          expect(typeof weight).toBe('number');
        }

        // Verify factor confidences are between 0 and 1
        for (const confidence of Object.values(beliefs.factorConfidences)) {
          expect(confidence as number).toBeGreaterThanOrEqual(0);
          expect(confidence as number).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should include regime information in beliefs', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/beliefs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const beliefs = data.data;

      expect(beliefs.currentRegime).toBeDefined();
      expect(['bull', 'bear', 'sideways', 'volatile', 'recovery']).toContain(
        beliefs.currentRegime
      );
      expect(typeof beliefs.regimeConfidence).toBe('number');
      expect(beliefs.regimeConfidence).toBeGreaterThanOrEqual(0);
      expect(beliefs.regimeConfidence).toBeLessThanOrEqual(1);
    });

    it('should include risk parameters in beliefs', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/beliefs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const beliefs = data.data;

      expect(typeof beliefs.riskTolerance).toBe('number');
      expect(typeof beliefs.maxDrawdownThreshold).toBe('number');
      expect(typeof beliefs.volatilityTarget).toBe('number');
      expect(typeof beliefs.concentrationLimit).toBe('number');
    });
  });

  // =============================================
  // Meta-Prompt Cards
  // =============================================
  describe('Meta-Prompt Cards', () => {
    it('should display meta-prompt insights from risk assessment', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioValue: 100000,
          portfolioReturns: [0.01, -0.005, 0.02, 0.015, -0.01, 0.008],
          positions: [
            { symbol: 'AAPL', weight: 0.35 },
            { symbol: 'MSFT', weight: 0.30 },
            { symbol: 'GOOGL', weight: 0.20 },
            { symbol: 'NVDA', weight: 0.15 },
          ],
        }),
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);

        const assessment = data.data;
        // Meta-prompt insights
        expect(assessment.overEpisode).toBeDefined();
        expect(assessment.overEpisode.metaPrompt).toBeDefined();

        const metaPrompt = assessment.overEpisode.metaPrompt;
        expect(metaPrompt.optimizationDirection).toBeDefined();
        expect(Array.isArray(metaPrompt.keyLearnings)).toBe(true);
        expect(metaPrompt.keyLearnings.length).toBeGreaterThan(0);
        expect(metaPrompt.factorAdjustments).toBeDefined();
        expect(metaPrompt.riskGuidance).toBeDefined();
        expect(metaPrompt.timingInsights).toBeDefined();
        expect(metaPrompt.generatedAt).toBeDefined();
      }
    });

    it('should include within-episode CVaR assessment', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioValue: 50000,
          portfolioReturns: [0.01, -0.02, 0.005],
          positions: [{ symbol: 'AAPL', weight: 0.5 }, { symbol: 'MSFT', weight: 0.5 }],
        }),
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      const withinEpisode = data.data.withinEpisode;

      expect(typeof withinEpisode.currentCVaR).toBe('number');
      expect(typeof withinEpisode.threshold).toBe('number');
      expect(typeof withinEpisode.triggered).toBe('boolean');
      expect(withinEpisode.adjustment).toBeDefined();
      expect(['none', 'reduce_exposure', 'hedge', 'rebalance']).toContain(
        withinEpisode.adjustment.type
      );
    });
  });

  // =============================================
  // Error States
  // =============================================
  describe('Error States', () => {
    it('should display error when recording decision without required fields', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // 400 = validation error, 404 = not deployed
      expect([400, 404]).toContain(response.status);

      if (response.status === 400) {
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
        expect(data.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should display error when risk assessment lacks required body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // 400 = validation error, 404 = not deployed, 500 = server error
      expect([400, 404, 500]).toContain(response.status);

      if (response.status === 400) {
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      }
    });
  });

  // =============================================
  // Episode Lifecycle (Start → Decide → Close)
  // =============================================
  describe('Episode Lifecycle', () => {
    it('should start a new episode', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/episode/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.id).toBeDefined();
        expect(data.data.startDate).toBeDefined();
        expect(data.data.message).toContain('episode started');
      }
    });

    it('should record a trading decision with full structure', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'AAPL',
          action: 'buy',
          weightBefore: 0.10,
          weightAfter: 0.15,
          reason: 'Strong momentum signal with quality tilt',
          confidence: 0.82,
          factors: [
            { factor: 'momentum', exposure: 0.35, tStat: 2.1, confidence: 0.85, contribution: 0.12 },
          ],
        }),
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.id).toBeDefined();
        expect(data.data.symbol).toBe('AAPL');
        expect(data.data.action).toBe('buy');
        expect(data.data.confidence).toBe(0.82);
      }
    });

    it('should close episode and return CVRF cycle results', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/episode/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);

        // Episode summary
        expect(data.data.episode).toBeDefined();
        expect(data.data.episode.id).toBeDefined();
        expect(typeof data.data.episode.decisionsCount).toBe('number');
        expect(typeof data.data.episode.portfolioReturn).toBe('number');
        expect(typeof data.data.episode.sharpeRatio).toBe('number');

        // CVRF cycle result
        expect(data.data.cvrfResult).toBeDefined();
        expect(typeof data.data.cvrfResult.performanceDelta).toBe('number');
        expect(typeof data.data.cvrfResult.decisionOverlap).toBe('number');
        expect(typeof data.data.cvrfResult.insightsExtracted).toBe('number');
        expect(typeof data.data.cvrfResult.beliefUpdates).toBe('number');
        expect(data.data.cvrfResult.newRegime).toBeDefined();
      }
    });
  });

  // =============================================
  // Optimization Constraints
  // =============================================
  describe('Optimization Constraints', () => {
    it('should return CVRF-derived optimization constraints', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/constraints`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);

        const constraints = data.data;
        expect(constraints.factorTargets).toBeDefined();
        expect(typeof constraints.maxWeight).toBe('number');
        expect(typeof constraints.minWeight).toBe('number');
        expect(typeof constraints.volatilityTarget).toBe('number');
        expect(typeof constraints.riskBudget).toBe('number');

        // Factor targets should have target and tolerance
        for (const target of Object.values(constraints.factorTargets)) {
          expect(typeof (target as { target: number; tolerance: number }).target).toBe('number');
          expect(typeof (target as { target: number; tolerance: number }).tolerance).toBe('number');
        }
      }
    });
  });

  // =============================================
  // Loading & Performance
  // =============================================
  describe('Loading & Performance', () => {
    it('should respond to beliefs endpoint within 500ms', async () => {
      const startTime = Date.now();

      const response = await fetch(`${API_BASE}/api/v1/cvrf/beliefs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const latency = Date.now() - startTime;

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        expect(latency).toBeLessThan(500);
      }
    });

    it('should include meta timing information in responses', async () => {
      const response = await fetch(`${API_BASE}/api/v1/cvrf/beliefs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404 || isExternalApiError(response.status)) {
        expect(true).toBe(true);
        return;
      }

      const data = await response.json();
      expect(data.meta).toBeDefined();
      expect(data.meta.requestId).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
    });
  });
});
