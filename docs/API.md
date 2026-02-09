# Frontier Alpha API Reference

Complete API documentation for the Frontier Alpha Cognitive Factor Intelligence Platform.

## Base URL

| Environment | URL |
|-------------|-----|
| Production  | `https://frontier-alpha.vercel.app/api/v1` |
| Local Dev   | `http://localhost:3000/api/v1` |

All endpoints are prefixed with `/api/v1` unless otherwise noted.

## Authentication

Frontier Alpha uses Supabase Auth with JWT Bearer tokens for protected endpoints.

### Obtaining a Token

Sign in through the client application or use the Supabase Auth API directly:

```bash
curl -X POST https://your-project.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'
```

### Using a Token

Include the token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Endpoint Protection Levels

| Level | Description |
|-------|-------------|
| **Public** | No authentication required |
| **Protected** | Requires valid Bearer token; returns 401 without it |
| **Optional Auth** | Works without a token but returns personalized data with one |

---

## Response Format

All responses follow a consistent envelope structure:

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-08T12:00:00.000Z",
    "requestId": "req-a1b2c3",
    "latencyMs": 42
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  },
  "meta": {
    "timestamp": "2026-02-08T12:00:00.000Z",
    "requestId": "req-a1b2c3",
    "latencyMs": 5
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid parameters or request body |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `NOT_FOUND` | 404 | Resource does not exist |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported for this endpoint |
| `VALIDATION_ERROR` | 400 | Request body fails validation |
| `OPTIMIZATION_ERROR` | 500 | Portfolio optimization computation failed |
| `FACTOR_ERROR` | 500 | Factor engine calculation failed |
| `FORECAST_ERROR` | 500 | Earnings forecast generation failed |
| `CVRF_ERROR` | 400/500 | CVRF operation failed |
| `BACKTEST_ERROR` | 500 | Backtest computation failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting

- Polygon.io data endpoints are subject to upstream rate limits (5 req/min on free tier).
- Alpha Vantage endpoints are limited to 5 requests per minute, 500 per day (free tier).
- No application-level rate limiting is currently enforced.
- Responses from rate-limited upstream APIs fall back to mock data transparently.

---

## Endpoints

### Health

#### GET /api/v1/health

Check the health of the API and its dependencies.

**Auth:** Public

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `quick` | string | `"false"` | Set to `"true"` to skip database and external API checks |

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-08T12:00:00.000Z",
  "version": "1.0.4",
  "environment": "production",
  "checks": {
    "api": { "status": "ok", "latencyMs": 1 },
    "database": { "status": "ok" },
    "external": { "status": "ok" }
  },
  "metrics": {
    "uptime": 86400,
    "memoryUsage": 128,
    "requestCount": 1542
  }
}
```

**Status values:** `healthy` (all OK), `degraded` (one check failed), `unhealthy` (two or more checks failed, returns HTTP 503).

---

### Quotes

#### GET /api/v1/quotes/:symbol

Get a real-time quote for a single symbol.

**Auth:** Public

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbol` | string | Stock ticker symbol (e.g., `AAPL`) |

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/quotes/AAPL
```

**Response:**

```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "timestamp": "2026-02-08T15:30:00.000Z",
    "bid": 189.98,
    "ask": 190.02,
    "last": 190.00,
    "change": 1.25,
    "changePercent": 0.66
  },
  "meta": {
    "timestamp": "2026-02-08T15:30:01.000Z",
    "requestId": "req-x7k9m2",
    "latencyMs": 45
  }
}
```

#### GET /api/v1/quotes/stream

Get batch quotes for multiple symbols.

**Auth:** Public

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `symbols` | string | Yes | Comma-separated ticker symbols |

**Example:**

```bash
curl "https://frontier-alpha.vercel.app/api/v1/quotes/stream?symbols=AAPL,NVDA,MSFT"
```

**Response:**

```json
{
  "success": true,
  "data": [
    { "symbol": "AAPL", "last": 190.00, "change": 1.25, "changePercent": 0.66, ... },
    { "symbol": "NVDA", "last": 725.50, "change": -3.20, "changePercent": -0.44, ... },
    { "symbol": "MSFT", "last": 410.75, "change": 2.10, "changePercent": 0.51, ... }
  ],
  "meta": {
    "timestamp": "2026-02-08T15:30:01.000Z",
    "source": "fastify",
    "count": 3
  }
}
```

---

### Portfolio

#### GET /api/v1/portfolio

Get the authenticated user's portfolio with current positions and values.

**Auth:** Protected

**Example:**

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://frontier-alpha.vercel.app/api/v1/portfolio
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "Main Portfolio",
    "positions": [
      {
        "id": "pos-uuid",
        "symbol": "AAPL",
        "shares": 100,
        "avgCost": 150.00,
        "currentPrice": 190.00,
        "marketValue": 19000.00,
        "unrealizedPnL": 4000.00,
        "weight": 0.38
      }
    ],
    "totalValue": 50000.00,
    "cashBalance": 5000.00
  },
  "meta": { ... }
}
```

#### POST /api/v1/portfolio/optimize

Run portfolio optimization using Monte Carlo simulation.

**Auth:** Public

**Request Body:**

```json
{
  "symbols": ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN"],
  "config": {
    "objective": "max_sharpe",
    "riskFreeRate": 0.05
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbols` | string[] | Yes | Array of ticker symbols to optimize |
| `config.objective` | string | No | `max_sharpe` (default), `min_variance`, or `risk_parity` |
| `config.riskFreeRate` | number | No | Annualized risk-free rate (default: 0.05) |

**Example:**

```bash
curl -X POST https://frontier-alpha.vercel.app/api/v1/portfolio/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN"],
    "config": { "objective": "max_sharpe", "riskFreeRate": 0.05 }
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "weights": {
      "AAPL": 0.22,
      "NVDA": 0.18,
      "MSFT": 0.25,
      "GOOGL": 0.20,
      "AMZN": 0.15
    },
    "expectedReturn": 0.12,
    "volatility": 0.18,
    "sharpeRatio": 0.61,
    "efficientFrontier": [ ... ]
  },
  "meta": { ... }
}
```

#### GET /api/v1/portfolio/factors/:symbols

Get factor exposures for a set of symbols.

**Auth:** Public

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbols` | string | Comma-separated ticker symbols |

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/portfolio/factors/AAPL,NVDA,MSFT
```

**Response:**

```json
{
  "success": true,
  "data": {
    "AAPL": [
      {
        "factor": "momentum",
        "exposure": 0.45,
        "tStat": 2.31,
        "confidence": 0.82,
        "contribution": 0.08
      },
      {
        "factor": "quality",
        "exposure": 0.72,
        "tStat": 3.15,
        "confidence": 0.91,
        "contribution": 0.12
      }
    ]
  },
  "meta": { ... }
}
```

#### POST /api/v1/portfolio/positions

Add a position to the authenticated user's portfolio.

**Auth:** Protected

**Request Body:**

```json
{
  "symbol": "AAPL",
  "shares": 100,
  "avgCost": 150.00
}
```

#### PUT /api/v1/portfolio/positions/:id

Update an existing position.

**Auth:** Protected

**Request Body:**

```json
{
  "shares": 150,
  "avgCost": 155.00
}
```

#### DELETE /api/v1/portfolio/positions/:id

Remove a position from the portfolio.

**Auth:** Protected

---

### CVRF (Conceptual Verbal Reinforcement Framework)

The CVRF system manages belief evolution through trading episodes. Beliefs update based on comparative performance analysis across episodes.

#### GET /api/v1/cvrf/episodes

Get CVRF episode history including the current active episode and completed episodes.

**Auth:** Public

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/cvrf/episodes
```

**Response:**

```json
{
  "success": true,
  "data": {
    "current": {
      "id": "ep-uuid",
      "episodeNumber": 5,
      "startDate": "2026-02-01T00:00:00.000Z",
      "decisionsCount": 12,
      "status": "active"
    },
    "completed": [
      {
        "id": "ep-uuid-prev",
        "episodeNumber": 4,
        "startDate": "2026-01-15T00:00:00.000Z",
        "endDate": "2026-01-31T00:00:00.000Z",
        "decisionsCount": 18,
        "portfolioReturn": 0.034,
        "sharpeRatio": 1.42,
        "maxDrawdown": -0.021,
        "status": "completed"
      }
    ],
    "totalEpisodes": 5
  },
  "meta": { ... }
}
```

#### GET /api/v1/cvrf/beliefs

Get the current CVRF belief state including factor weights and confidence levels.

**Auth:** Public

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/cvrf/beliefs
```

**Response:**

```json
{
  "success": true,
  "data": {
    "currentRegime": "risk_on",
    "riskTolerance": 0.65,
    "factorWeights": {
      "momentum": 0.25,
      "value": 0.15,
      "quality": 0.30,
      "volatility": -0.20,
      "size": 0.10
    },
    "factorConfidences": {
      "momentum": 0.82,
      "value": 0.71,
      "quality": 0.90,
      "volatility": 0.75,
      "size": 0.60
    },
    "lastUpdated": "2026-02-01T00:00:00.000Z"
  },
  "meta": { ... }
}
```

#### GET /api/v1/cvrf/meta-prompt

Get the latest meta-prompt generated from the most recent CVRF cycle, including optimization direction, key learnings, and factor adjustments.

**Auth:** Public

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/cvrf/meta-prompt
```

**Response:**

```json
{
  "success": true,
  "data": {
    "optimizationDirection": "Increase quality factor exposure while reducing momentum tilt",
    "keyLearnings": [
      "Quality stocks outperformed during recent volatility regime",
      "Momentum reversal detected in tech sector"
    ],
    "factorAdjustments": {
      "quality": 0.05,
      "momentum": -0.03,
      "value": 0.02
    },
    "riskGuidance": "Maintain defensive posture with 65% risk tolerance",
    "timingInsights": "Earnings season creating cross-sector dispersion",
    "generatedAt": "2026-02-01T00:00:00.000Z",
    "cycleNumber": 4,
    "sourceEpisodes": {
      "previous": 0.021,
      "current": 0.034,
      "delta": 0.013
    }
  },
  "meta": { ... }
}
```

Returns `"data": null` if no CVRF cycles have been completed yet.

#### GET /api/v1/cvrf/history

Get the complete CVRF cycle history with performance comparisons and belief updates.

**Auth:** Public

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/cvrf/history
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-02-01T00:00:00.000Z",
      "previousEpisodeReturn": 0.021,
      "currentEpisodeReturn": 0.034,
      "performanceDelta": 0.013,
      "decisionOverlap": 0.65,
      "insightsCount": 4,
      "beliefUpdatesCount": 3,
      "newRegime": "risk_on"
    }
  ],
  "meta": { ... }
}
```

#### POST /api/v1/cvrf/episode/start

Start a new CVRF trading episode.

**Auth:** Public

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "ep-uuid",
    "startDate": "2026-02-08T00:00:00.000Z",
    "message": "CVRF episode started. Record decisions and close when complete."
  },
  "meta": { ... }
}
```

#### POST /api/v1/cvrf/episode/close

Close the current CVRF episode and optionally run the CVRF reinforcement cycle.

**Auth:** Public

**Request Body:**

```json
{
  "runCvrfCycle": true
}
```

#### POST /api/v1/cvrf/decision

Record a trading decision within the current episode.

**Auth:** Public

**Request Body:**

```json
{
  "symbol": "AAPL",
  "action": "buy",
  "weightBefore": 0.15,
  "weightAfter": 0.22,
  "reason": "Strong quality factor with momentum confirmation",
  "confidence": 0.85,
  "factors": [
    {
      "factor": "quality",
      "exposure": 0.72,
      "tStat": 3.15,
      "confidence": 0.91,
      "contribution": 0.12
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | Yes | Ticker symbol |
| `action` | string | Yes | `buy`, `sell`, `hold`, or `rebalance` |
| `weightBefore` | number | Yes | Portfolio weight before the decision (0-1) |
| `weightAfter` | number | Yes | Portfolio weight after the decision (0-1) |
| `reason` | string | Yes | Textual explanation of the decision |
| `confidence` | number | Yes | Decision confidence (0-1) |
| `factors` | array | No | Factor exposures informing the decision |

#### GET /api/v1/cvrf/constraints

Get CVRF-derived optimization constraints based on current belief state.

**Auth:** Public

#### POST /api/v1/cvrf/risk

Get a CVRF-enhanced dual-level risk assessment.

**Auth:** Public

**Request Body:**

```json
{
  "portfolioValue": 100000,
  "portfolioReturns": [0.01, -0.005, 0.008, ...],
  "positions": [
    { "symbol": "AAPL", "weight": 0.25 },
    { "symbol": "NVDA", "weight": 0.20 }
  ]
}
```

---

### Earnings

#### GET /api/v1/earnings/upcoming

Get upcoming earnings announcements for portfolio holdings or a specified list.

**Auth:** Public

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `symbols` | string | Top 10 S&P 500 | Comma-separated symbols to check |
| `daysAhead` | number | 30 | Number of days ahead to search |
| `days` | number | 30 | Alias for `daysAhead` |

**Example:**

```bash
curl "https://frontier-alpha.vercel.app/api/v1/earnings/upcoming?symbols=AAPL,NVDA&daysAhead=14"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "earn-nvda-2026-02-20",
      "symbol": "NVDA",
      "reportDate": "2026-02-20",
      "reportTime": "post_market",
      "fiscalQuarter": "Q4 2025",
      "estimatedEps": 4.50,
      "status": "confirmed",
      "expectedMove": 0.072,
      "recommendation": "hedge",
      "explanation": "NVDA has elevated expected move (7.2%). Consider protective options."
    }
  ],
  "meta": {
    "timestamp": "2026-02-08T12:00:00.000Z",
    "source": "alpha_vantage",
    "count": 1
  }
}
```

The `source` field indicates whether data came from `alpha_vantage` (real) or `mock` (fallback).

#### GET /api/v1/earnings/forecast/:symbol

Get an earnings impact forecast for a specific symbol.

**Auth:** Public

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbol` | string | Stock ticker symbol |

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `reportDate` | string | Optional ISO date string for the earnings date |

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/earnings/forecast/NVDA
```

**Response:**

```json
{
  "success": true,
  "data": {
    "symbol": "NVDA",
    "reportDate": "2026-02-20",
    "expectedMove": 0.072,
    "expectedDirection": "up",
    "confidence": 0.78,
    "historicalAvgMove": 0.068,
    "beatRate": 75,
    "recommendation": "hedge",
    "explanation": "NVDA has high historical earnings volatility...",
    "factors": {
      "historicalPattern": "75% beat rate, 7% avg move",
      "recentTrend": "Elevated volatility in tech sector",
      "riskAssessment": "HIGH"
    }
  },
  "meta": {
    "source": "oracle"
  }
}
```

#### GET /api/v1/earnings/history/:symbol

Get historical earnings reactions for pattern analysis.

**Auth:** Public

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbol` | string | Stock ticker symbol |

**Example:**

```bash
curl https://frontier-alpha.vercel.app/api/v1/earnings/history/AAPL
```

**Response:**

```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "reactions": [
      {
        "reportDate": "2025-11-01",
        "fiscalQuarter": "Q4 2025",
        "estimatedEps": 1.89,
        "actualEps": 2.10,
        "surprise": 11.1,
        "priceMove": 3.42,
        "postEarningsDrift": 0.68,
        "outcome": "beat"
      }
    ],
    "summary": {
      "quarters": 8,
      "beatRate": 75.0,
      "avgMove": 4.52,
      "avgBeatMove": 3.85,
      "avgMissMove": -5.20
    }
  },
  "meta": {
    "source": "alpha_vantage"
  }
}
```

#### POST /api/v1/earnings/forecast/:symbol/refresh

Force a refresh of the earnings forecast for a symbol (re-fetches upstream data).

**Auth:** Public

---

### Explain

#### POST /api/v1/explain

Generate a cognitive explanation for a portfolio decision or market event. Uses LLM when available, falls back to template-based generation.

**Auth:** Public

**Request Body:**

```json
{
  "type": "portfolio_move",
  "symbol": "AAPL",
  "context": {
    "factors": [
      { "factor": "momentum", "exposure": 0.45, "tStat": 2.31, "confidence": 0.82, "contribution": 0.08 }
    ],
    "sentiment": {
      "label": "positive",
      "confidence": 0.78,
      "scores": { "positive": 0.78, "neutral": 0.18, "negative": 0.04 }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `portfolio_move`, `rebalance`, `earnings`, `risk_alert`, `factor_shift` |
| `symbol` | string | No | Ticker symbol (required for symbol-specific explanations) |
| `context` | object | No | Additional data for richer explanations |

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "exp-1707350400-x7k9m2",
    "type": "portfolio_move",
    "symbol": "AAPL",
    "text": "AAPL is driven by momentum (positive, 0.45), quality (positive, 0.72). Sentiment is bullish (78% confidence).",
    "confidence": 0.82,
    "sources": ["factor_engine", "sentiment_analysis"],
    "generatedAt": "2026-02-08T12:00:00.000Z",
    "cached": false
  },
  "meta": {
    "source": "template"
  }
}
```

Explanations are cached per type and symbol for the current day. Subsequent requests return the cached result with `"cached": true`.

---

### Backtest

#### POST /api/v1/backtest/run

Run a walk-forward backtest with optional CVRF belief integration.

**Auth:** Public

**Request Body:**

```json
{
  "symbols": ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN"],
  "startDate": "2023-01-01",
  "endDate": "2025-12-31",
  "initialCapital": 100000,
  "episodeLengthDays": 21,
  "strategy": "max_sharpe",
  "useCVRF": true,
  "rebalanceFrequency": "monthly"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `symbols` | string[] | -- | **Required.** Symbols to include |
| `startDate` | string | `"2023-01-01"` | Backtest start date (ISO format) |
| `endDate` | string | Today | Backtest end date |
| `initialCapital` | number | `100000` | Starting capital in dollars |
| `episodeLengthDays` | number | `21` | Trading days per CVRF episode |
| `strategy` | string | `"max_sharpe"` | Optimization strategy |
| `useCVRF` | boolean | `true` | Whether to apply CVRF belief adjustments |
| `rebalanceFrequency` | string | `"monthly"` | Rebalance schedule |

**Response:**

```json
{
  "success": true,
  "data": {
    "totalReturn": 0.342,
    "annualizedReturn": 0.114,
    "sharpeRatio": 1.28,
    "maxDrawdown": -0.089,
    "episodes": [ ... ],
    "equityCurve": [ ... ],
    "factorAttribution": { ... }
  },
  "meta": {
    "latencyMs": 2340,
    "persistent": false
  }
}
```

---

### Notifications

#### POST /api/v1/notifications/subscribe

Subscribe a browser push endpoint to receive notifications.

**Auth:** Optional (uses token to identify user if present)

**Request Body:**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "auth": "base64-auth-key",
      "p256dh": "base64-p256dh-key"
    }
  },
  "userId": "optional-user-id"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "user-abc12345",
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "subscribed": true
  },
  "meta": { ... }
}
```

---

### Settings

#### GET /api/v1/settings

Get the authenticated user's application settings.

**Auth:** Protected

**Response:**

```json
{
  "success": true,
  "data": {
    "display_name": "John",
    "risk_tolerance": "moderate",
    "notifications_enabled": true,
    "email_alerts": true,
    "max_position_pct": 20,
    "stop_loss_pct": 10,
    "take_profit_pct": 25
  },
  "meta": { ... }
}
```

#### PUT /api/v1/settings

Update user settings.

**Auth:** Protected

**Request Body (all fields optional):**

```json
{
  "display_name": "John",
  "risk_tolerance": "aggressive",
  "notifications_enabled": true,
  "email_alerts": false,
  "max_position_pct": 25,
  "stop_loss_pct": 15,
  "take_profit_pct": 30
}
```

| Field | Type | Values |
|-------|------|--------|
| `risk_tolerance` | string | `conservative`, `moderate`, `aggressive` |
| `max_position_pct` | number | 1-100 |
| `stop_loss_pct` | number | 1-100 |
| `take_profit_pct` | number | 1-500 |

---

### Alerts

#### GET /api/v1/alerts

Get risk alerts for the authenticated user's portfolio.

**Auth:** Protected

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "alert-uuid",
      "alert_type": "concentration",
      "severity": "high",
      "title": "Position concentration warning",
      "message": "NVDA weight at 32%, exceeding 25% limit.",
      "metadata": { "symbol": "NVDA", "weight": 0.32, "threshold": 0.25 },
      "acknowledged_at": null,
      "created_at": "2026-02-08T10:00:00.000Z"
    }
  ],
  "meta": { ... }
}
```

#### PUT /api/v1/alerts/:id/acknowledge

Acknowledge (dismiss) a risk alert.

**Auth:** Protected

---

### WebSocket

#### ws://localhost:3000/ws/quotes

Real-time quote streaming over WebSocket (available on the Fastify server, not Vercel serverless).

**Subscribe:**

```json
{
  "type": "subscribe",
  "symbols": ["AAPL", "NVDA", "MSFT"]
}
```

**Incoming messages:**

```json
{
  "type": "quote",
  "data": {
    "symbol": "AAPL",
    "last": 190.05,
    "change": 1.30,
    "changePercent": 0.69,
    "timestamp": "2026-02-08T15:30:05.000Z"
  }
}
```
