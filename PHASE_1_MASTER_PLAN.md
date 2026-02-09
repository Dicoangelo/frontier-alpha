# 🤠 FRONTIER ALPHA - PHASE 1 MASTER PLAN
## 30-Day Production-Grade Platform Upgrade

**Version:** 1.0.0
**Created:** 2026-02-08
**Status:** 🟢 Active
**GitHub:** `Dicoangelo/frontier-alpha`

---

## 🎯 Phase 1 Objectives

Transform Frontier Alpha from prototype to **production-grade institutional fintech platform** with:

1. ✅ **Stable Test Suite** - 80%+ coverage, all E2E tests passing
2. ✅ **Live Market Data** - Real-time quote streaming (<100ms latency)
3. ✅ **CVRF Intelligence** - Full episodic learning visualization
4. ✅ **Enhanced UX** - Earnings Oracle + AI Explainer + PWA
5. ✅ **API Platform** - Developer-ready with rate limiting & docs
6. ✅ **Observability** - Full monitoring stack

---

## 📋 Session Tracker

Use this to track progress across multiple Claude Code sessions:

| Week | Focus Area | Status | Session ID | Completion |
|------|------------|--------|------------|------------|
| **1** | Test & Data Foundation | 🟢 Complete | Session 1 (2026-02-08) | 100% |
| **2** | CVRF Intelligence | 🟢 Complete | Session 2 (2026-02-08) | 100% |
| **3** | User Experience | 🔵 Queued | - | 0% |
| **4** | Scale & Polish | 🔵 Queued | - | 0% |

**Status Legend:** 🔵 Queued | 🟡 In Progress | 🟢 Complete | 🔴 Blocked

---

## 🗓️ WEEK 1: Test & Data Foundation (Days 1-7)

### **Milestone:** Stable CI/CD + Live Market Data

#### **Task 1.1: Fix E2E Test Suite** ⏱️ 2 days
**Status:** 🟢 Complete
**Priority:** 🔥 Critical

**Problem:** E2E tests failing with fetch errors (server not running during tests)

**Solution:**
1. **Mock API Server** - MSW (Mock Service Worker) setup
2. **Test Data Fixtures** - Realistic market data fixtures
3. **Test Isolation** - Each test runs in clean state
4. **Coverage Report** - Vitest coverage plugin

**Files to Modify:**
```
tests/e2e/factors.test.ts              ← Fix fetch failures
tests/e2e/portfolio.test.ts            ← Add if missing
tests/e2e/earnings.test.ts             ← Add if missing
tests/setup/msw.ts                     ← CREATE: MSW handlers
tests/fixtures/market-data.ts          ← CREATE: Test fixtures
vitest.config.ts                       ← Update coverage config
package.json                           ← Add msw dependency
```

**Acceptance Criteria:**
- [ ] All 376 tests pass (`npm test`)
- [ ] Coverage >80% on core modules (factors, optimizer, cvrf)
- [ ] Tests run in <30 seconds
- [ ] No flaky tests (run 10 times, all pass)

**Verification:**
```bash
npm test
npm run test:coverage
# Should see: "376 passed, 0 failed, Coverage: 82%"
```

---

#### **Task 1.2: Integrate Real-Time Market Data** ⏱️ 3 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** Live quote streaming via Polygon.io or Alpaca

**Decision Point:** Choose provider
- **Polygon.io** - $99/mo (Starter), <20ms latency, 5 concurrent connections
- **Alpaca** - Free (15-min delayed) or $99/mo (real-time)
- **Recommendation:** Start with Alpaca free for dev, upgrade for production

**Implementation Steps:**

**Step 1.2.1: Provider Setup**
```bash
# Create Alpaca account: https://alpaca.markets
# Get API keys: Paper Trading → API Keys
# Add to .env
```

**Files to Modify:**
```
.env                                   ← Add ALPACA_API_KEY, ALPACA_SECRET
src/data/MarketDataProvider.ts         ← Update to use Alpaca
src/data/AlpacaProvider.ts             ← CREATE: Alpaca adapter
api/v1/quotes.ts                       ← Update WebSocket route
client/src/api/websocket.ts            ← Update client WebSocket
package.json                           ← Add @alpacahq/alpaca-trade-api
```

**Step 1.2.2: WebSocket Implementation**
```typescript
// src/data/AlpacaProvider.ts - Key structure
export class AlpacaProvider {
  async streamQuotes(symbols: string[], callback: (quote) => void)
  async getHistoricalPrices(symbol: string, from: Date, to: Date)
  async getBars(symbol: string, timeframe: '1Min' | '5Min' | '1H')
}
```

**Step 1.2.3: Client Integration**
```typescript
// client/src/api/websocket.ts
const ws = new WebSocket(`${API_URL}/ws/quotes`)
ws.send(JSON.stringify({ subscribe: ['AAPL', 'NVDA', 'MSFT'] }))
ws.onmessage = (event) => {
  const quote = JSON.parse(event.data)
  updateStore(quote) // Zustand store
}
```

**Acceptance Criteria:**
- [ ] Connect to Alpaca WebSocket API
- [ ] Stream quotes for 5+ symbols simultaneously
- [ ] Display real-time prices in dashboard (<100ms latency)
- [ ] Handle reconnection on disconnect
- [ ] Rate limit: respect Alpaca's 200 msg/sec limit

**Verification:**
```bash
npm run dev
# Visit http://localhost:3000
# Dashboard should show live-updating prices for AAPL, NVDA, etc.
# Open DevTools → Network → WS → See messages flowing
```

---

#### **Task 1.3: CI/CD Pipeline** ⏱️ 1 day
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** Automated testing on every push

**Files to Create:**
```
.github/workflows/ci.yml               ← CREATE: CI pipeline
.github/workflows/deploy.yml           ← CREATE: Deploy to Vercel
```

**CI Pipeline Structure:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: cd client && npm ci && npm test
```

**Acceptance Criteria:**
- [ ] Tests run on every commit
- [ ] Failed tests block merge
- [ ] Deploy to Vercel on merge to main
- [ ] Slack/Discord notification on deploy

**Verification:**
```bash
git commit -m "test: trigger CI"
git push
# Check GitHub Actions tab → See green checkmark
```

---

#### **Task 1.4: Database Migrations** ⏱️ 1 day
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** Proper schema versioning with Supabase migrations

**Files to Create:**
```
supabase/migrations/20260208_init.sql           ← Initial schema
supabase/migrations/20260208_cvrf_tables.sql    ← CVRF tables
supabase/migrations/20260208_users_portfolios.sql ← Core tables
scripts/migrate.ts                              ← Migration runner
```

**Schema Additions:**
```sql
-- CVRF Tables
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  portfolio_return DECIMAL(10,4),
  sharpe_ratio DECIMAL(10,4),
  max_drawdown DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE belief_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  version INTEGER NOT NULL,
  factor_weights JSONB,
  risk_tolerance DECIMAL(5,4),
  current_regime TEXT,
  conceptual_priors JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id),
  timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL, -- 'buy' | 'sell' | 'hold' | 'rebalance'
  weight_before DECIMAL(10,4),
  weight_after DECIMAL(10,4),
  reason TEXT,
  confidence DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episodes_user_date ON episodes(user_id, start_date);
CREATE INDEX idx_decisions_episode ON decisions(episode_id);
```

**Acceptance Criteria:**
- [ ] All tables created via migrations
- [ ] `npm run db:migrate` applies migrations
- [ ] `npm run db:reset` resets database
- [ ] No manual SQL required

---

### **Week 1 Checkpoint**

**Exit Criteria (All must pass):**
- [ ] `npm test` → 376 tests passing, 80%+ coverage
- [ ] `npm run dev` → Dashboard shows live-updating prices
- [ ] GitHub Actions → Green checkmark on latest commit
- [ ] Supabase → All tables exist with proper indexes

**Deliverable:** Working demo with live data + stable tests

**Estimated Time:** 7 days (40-50 hours)

**Blockers/Risks:**
- ⚠️ Alpaca API rate limits during dev
- ⚠️ WebSocket reconnection edge cases
- ⚠️ Test data fixtures might be stale

**Mitigation:**
- Use Alpaca paper trading (unlimited)
- Add exponential backoff reconnection
- Generate fixtures from real API responses

---

## 🗓️ WEEK 2: CVRF Intelligence (Days 8-14)

### **Milestone:** Full Episodic Learning System

#### **Task 2.1: Episode Performance Dashboard** ⏱️ 3 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** Visual history of episodes with performance metrics

**UI Components to Build:**

**Component 2.1.1: Episode Timeline**
```typescript
// client/src/components/cvrf/EpisodeTimeline.tsx
interface Props {
  episodes: Episode[]
}
// Visual: Horizontal timeline, each episode = card
// Show: date range, return %, Sharpe, max DD
// Click → expand to show decisions
```

**Component 2.1.2: Episode Comparison View**
```typescript
// client/src/components/cvrf/EpisodeComparison.tsx
interface Props {
  episodeA: Episode
  episodeB: Episode
}
// Visual: Side-by-side comparison
// Highlight: what changed, what worked, what didn't
```

**Component 2.1.3: Performance Chart**
```typescript
// client/src/components/cvrf/EpisodePerformanceChart.tsx
// Line chart: episode returns over time
// Overlay: Sharpe ratio trend
// Benchmark: S&P 500 comparison
```

**Files to Modify:**
```
client/src/pages/CVRF.tsx              ← CREATE: CVRF dashboard page
client/src/components/cvrf/
  ├── EpisodeTimeline.tsx              ← CREATE
  ├── EpisodeComparison.tsx            ← CREATE
  ├── EpisodePerformanceChart.tsx      ← CREATE
  ├── EpisodeCard.tsx                  ← CREATE
  └── index.ts                         ← Exports
api/v1/cvrf/episodes.ts                ← GET /api/v1/cvrf/episodes
src/cvrf/EpisodeManager.ts             ← Update with analytics
```

**Acceptance Criteria:**
- [ ] Display all historical episodes
- [ ] Click episode → see all decisions in that period
- [ ] Compare any 2 episodes side-by-side
- [ ] Chart shows performance trend over time
- [ ] Mobile-responsive layout

---

#### **Task 2.2: Belief State Visualization** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** Interactive graph showing how beliefs evolve

**Visualization Types:**

**Viz 2.2.1: Factor Weights Over Time**
```typescript
// Heatmap: X=time, Y=factors, Color=weight (-1 to +1)
// Show: momentum, value, quality, volatility weights by episode
// Interaction: Hover → tooltip with explanation
```

**Viz 2.2.2: Belief Confidence Bands**
```typescript
// Line chart with confidence intervals
// Show: factor weight ± confidence
// Highlight: low confidence = exploration phase
```

**Viz 2.2.3: Regime Transitions**
```typescript
// Timeline with colored regions
// Bull (green), Bear (red), Sideways (yellow), Volatile (orange)
// Show: belief state changes at regime boundaries
```

**Files to Create:**
```
client/src/components/cvrf/BeliefStateGraph.tsx    ← CREATE
client/src/components/cvrf/FactorWeightHeatmap.tsx ← CREATE
client/src/components/cvrf/RegimeTimeline.tsx      ← CREATE
api/v1/cvrf/belief-history.ts                      ← GET belief states
src/cvrf/BeliefAnalytics.ts                        ← CREATE: Analytics helpers
```

**Acceptance Criteria:**
- [ ] Heatmap shows factor weight evolution
- [ ] Confidence bands visible on charts
- [ ] Regime transitions marked clearly
- [ ] Export belief history as CSV
- [ ] Responsive on mobile

---

#### **Task 2.3: Meta-Prompt Generation** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** AI-generated insights from episode comparisons

**Implementation:**

**Step 2.3.1: Comparison Analysis**
```typescript
// src/cvrf/ConceptExtractor.ts
export async function extractInsights(
  betterEpisode: Episode,
  worseEpisode: Episode
): Promise<ConceptualInsight[]> {
  // Compare decisions, factor exposures, timing
  // Identify what made better episode outperform
  // Return structured insights
}
```

**Step 2.3.2: Meta-Prompt Builder**
```typescript
// src/cvrf/MetaPromptGenerator.ts
export function generateMetaPrompt(
  insights: ConceptualInsight[]
): MetaPrompt {
  return {
    optimizationDirection: "Increase momentum exposure in uptrends",
    keyLearnings: [
      "Low volatility underperformed in this period",
      "Early rebalancing captured 2.3% extra return"
    ],
    factorAdjustments: new Map([
      ['momentum_12m', +0.15],
      ['low_vol', -0.10]
    ]),
    riskGuidance: "Increase position sizes in high-conviction trades",
    timingInsights: "Rebalance 2 days before earnings, not after"
  }
}
```

**Step 2.3.3: UI Integration**
```typescript
// client/src/components/cvrf/MetaPromptCard.tsx
// Display: Meta-prompt as actionable insights
// Buttons: "Apply to current beliefs", "Save for later", "Dismiss"
```

**Files to Modify:**
```
src/cvrf/ConceptExtractor.ts           ← Enhance concept extraction
src/cvrf/MetaPromptGenerator.ts        ← CREATE: Meta-prompt builder
client/src/components/cvrf/MetaPromptCard.tsx ← CREATE: UI
api/v1/cvrf/meta-prompt.ts             ← POST /api/v1/cvrf/meta-prompt
```

**Acceptance Criteria:**
- [ ] Auto-generate meta-prompt after each episode ends
- [ ] Show top 3 insights with evidence
- [ ] One-click apply to belief state
- [ ] Track which meta-prompts were applied
- [ ] Measure effectiveness of applied prompts

---

#### **Task 2.4: Walk-Forward Backtesting** ⏱️ 3 days
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** Validate CVRF with historical data

**Implementation:**

**Step 2.4.1: Historical Data Loader**
```typescript
// Already exists: src/backtest/HistoricalDataLoader.ts
// Enhance: Add factor returns from Ken French Library
// Add: Sentiment scores from historical news (optional)
```

**Step 2.4.2: Walk-Forward Engine**
```typescript
// src/backtest/WalkForwardEngine.ts (exists, enhance)
export async function runWalkForward(
  symbols: string[],
  startDate: Date,
  endDate: Date,
  episodeLengthDays: number,
  cvrfConfig: CVRFConfig
): Promise<WalkForwardResult> {
  // Split data into episodes
  // For each episode:
  //   1. Train on past data
  //   2. Update beliefs via CVRF
  //   3. Generate portfolio
  //   4. Test on episode data
  //   5. Record performance
  // Return: full backtest results
}
```

**Step 2.4.3: Backtest Dashboard**
```typescript
// client/src/pages/Backtest.tsx
// Show: equity curve, drawdowns, Sharpe trend
// Compare: CVRF vs static factors vs S&P 500
// Download: full backtest report
```

**Files to Modify:**
```
src/backtest/WalkForwardEngine.ts      ← Integrate CVRF
src/backtest/BacktestRunner.ts         ← CREATE: Orchestrator
client/src/pages/Backtest.tsx          ← CREATE: Backtest UI
api/v1/backtest/run.ts                 ← POST /api/v1/backtest/run
scripts/download-ken-french.ts         ← Enhance data download
```

**Acceptance Criteria:**
- [ ] Run 3-year backtest (2021-2024) in <5 minutes
- [ ] Show episode-by-episode performance
- [ ] CVRF outperforms static factors by >2% annually
- [ ] Max drawdown <15%
- [ ] Export results to CSV/JSON

---

### **Week 2 Checkpoint**

**Exit Criteria:**
- [ ] Episode timeline visible on CVRF page
- [ ] Belief state heatmap shows factor evolution
- [ ] Meta-prompts auto-generate after episodes
- [ ] Backtest runs successfully (3yr historical data)
- [ ] CVRF shows alpha over static approach

**Deliverable:** Full CVRF intelligence system with backtesting

**Estimated Time:** 7 days (40-50 hours)

**Blockers/Risks:**
- ⚠️ Historical data quality (missing/stale prices)
- ⚠️ CVRF might not outperform initially (needs tuning)
- ⚠️ Computational load on backtest runs

**Mitigation:**
- Cache historical data locally
- Run hyperparameter sweep on CVRF config
- Use worker threads for backtesting

---

## 🗓️ WEEK 3: User Experience (Days 15-21)

### **Milestone:** Enhanced Intelligence & Mobile-Ready

#### **Task 3.1: Earnings Oracle Dashboard** ⏱️ 3 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** Full earnings intelligence center

**Components to Build:**

**Component 3.1.1: Earnings Calendar**
```typescript
// client/src/components/earnings/EarningsCalendar.tsx
// Display: Next 30 days of earnings
// Grouping: By date, by portfolio holdings
// Highlight: High-impact earnings (>5% expected move)
```

**Component 3.1.2: Historical Reaction Chart**
```typescript
// client/src/components/earnings/HistoricalReactionChart.tsx
// Line chart: Last 8 quarters earnings moves
// Show: Expected move (gray band) vs actual move (colored bars)
```

**Component 3.1.3: Factor-Adjusted Forecast**
```typescript
// client/src/components/earnings/EarningsForecast.tsx
// Show:
//   - Base expected move (historical avg)
//   - Factor adjustment (momentum, volatility)
//   - Sentiment adjustment (positive sentiment = harder to beat)
//   - Final forecast with confidence interval
```

**Files to Modify:**
```
client/src/pages/Earnings.tsx          ← CREATE: Earnings page
client/src/components/earnings/
  ├── EarningsCalendar.tsx             ← CREATE
  ├── HistoricalReactionChart.tsx      ← CREATE
  ├── EarningsForecast.tsx             ← CREATE
  ├── EarningsAlerts.tsx               ← CREATE
  └── index.ts                         ← Exports
src/earnings/EarningsOracle.ts         ← Enhance forecast logic
api/v1/earnings/calendar.ts            ← GET /api/v1/earnings/calendar
api/v1/earnings/forecast.ts            ← Enhance existing endpoint
```

**Data Integration:**
```bash
# Earnings dates: Alpha Vantage or Polygon.io
curl "https://api.polygon.io/v3/reference/earnings?ticker=AAPL"
# Parse: date, eps_actual, eps_estimate, revenue_actual, revenue_estimate
```

**Acceptance Criteria:**
- [ ] Calendar shows next 30 days of earnings
- [ ] Historical chart shows last 8 quarters
- [ ] Factor-adjusted forecast with confidence bands
- [ ] Alerts: Email/push 2 days before earnings
- [ ] Mobile-optimized calendar view

---

#### **Task 3.2: Advanced Cognitive Explainer** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** GPT-4o-powered contextual explanations

**Integration Steps:**

**Step 3.2.1: OpenAI API Setup**
```bash
# Get API key: https://platform.openai.com/api-keys
# Add to .env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-2024-08-06  # or claude-3-5-sonnet-20241022
```

**Step 3.2.2: Explainer Service**
```typescript
// src/core/CognitiveExplainer.ts (enhance existing)
import OpenAI from 'openai'

export async function explainPortfolioMove(
  portfolio: Portfolio,
  factorAttribution: FactorAttribution,
  marketContext: MarketContext
): Promise<Explanation> {
  const prompt = `
You are a quantitative analyst explaining portfolio performance.

Portfolio: ${portfolio.symbols.join(', ')}
Today's Return: ${portfolio.todayReturn}%
Factor Attribution:
${formatFactorAttribution(factorAttribution)}

Market Context:
- S&P 500: ${marketContext.spyReturn}%
- VIX: ${marketContext.vix}
- Sector Leaders: ${marketContext.sectorLeaders}

Explain in 2-3 sentences why this portfolio moved today. Be specific about factor contributions.
  `

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.3
  })

  return {
    text: response.choices[0].message.content,
    confidence: calculateConfidence(factorAttribution),
    sources: ['factor_engine', 'market_data']
  }
}
```

**Step 3.2.3: Explanation Types**
```typescript
// Different explanation modes:
explainPortfolioMove()      // Daily performance
explainRebalance()          // Why rebalancing now
explainEarningsForecast()   // Why this expected move
explainRiskAlert()          // Why risk level changed
explainFactorShift()        // Why factor weights adjusted
```

**Files to Modify:**
```
src/core/CognitiveExplainer.ts         ← Enhance with GPT-4o
src/services/ExplanationService.ts     ← CREATE: Orchestrator
client/src/components/explainer/ExplanationCard.tsx ← UPDATE
api/v1/explain.ts                      ← POST /api/v1/explain
package.json                           ← Add openai package
```

**Acceptance Criteria:**
- [ ] Explain portfolio moves in <2 seconds
- [ ] Explanations reference specific factors
- [ ] Natural language, non-technical tone
- [ ] Cache explanations (1 per portfolio per day)
- [ ] Cost <$0.01 per explanation

---

#### **Task 3.3: Progressive Web App (PWA)** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** Install on mobile, offline support, push notifications

**Implementation:**

**Step 3.3.1: Service Worker**
```typescript
// client/src/service-worker.ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'

// Cache static assets
precacheAndRoute(self.__WB_MANIFEST)

// API responses: Network first, fallback to cache
registerRoute(
  /\/api\/v1\/.*/,
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3
  })
)

// Market data: Cache first (stale-while-revalidate)
registerRoute(
  /\/api\/v1\/quotes\/.*/,
  new CacheFirst({
    cacheName: 'quotes-cache',
    plugins: [
      { cacheWillUpdate: async ({ response }) => {
        // Only cache if fresh (< 1 min old)
        return response.headers.get('age') < 60 ? response : null
      }}
    ]
  })
)
```

**Step 3.3.2: Web App Manifest**
```json
// client/public/manifest.json
{
  "name": "Frontier Alpha",
  "short_name": "Frontier",
  "description": "AI-Powered Cognitive Factor Intelligence",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#f59e0b",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Step 3.3.3: Push Notifications**
```typescript
// src/notifications/PushService.ts
export async function sendPriceAlert(
  userId: string,
  symbol: string,
  price: number,
  threshold: number
) {
  const subscription = await getUserSubscription(userId)

  await webpush.sendNotification(subscription, JSON.stringify({
    title: `${symbol} Price Alert`,
    body: `${symbol} hit $${price} (threshold: $${threshold})`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: `/portfolio?symbol=${symbol}` }
  }))
}
```

**Files to Modify:**
```
client/vite.config.ts                  ← Add PWA plugin
client/src/service-worker.ts           ← CREATE
client/public/manifest.json            ← CREATE
client/public/icons/                   ← ADD: App icons
src/notifications/PushService.ts       ← CREATE
api/v1/notifications/subscribe.ts      ← POST /subscribe
package.json                           ← Add workbox, web-push
```

**Acceptance Criteria:**
- [ ] Install prompt appears on mobile
- [ ] Works offline (cached data)
- [ ] Push notifications for price alerts
- [ ] Lighthouse PWA score >90
- [ ] iOS + Android compatible

---

### **Week 3 Checkpoint**

**Exit Criteria:**
- [ ] Earnings calendar shows next 30 days
- [ ] Portfolio explanations use GPT-4o
- [ ] App installable on mobile (iOS + Android)
- [ ] Push notifications work for price alerts
- [ ] Offline mode caches last session data

**Deliverable:** Mobile-first intelligent platform

**Estimated Time:** 7 days (40-50 hours)

**Blockers/Risks:**
- ⚠️ OpenAI API rate limits (60 req/min)
- ⚠️ iOS push notifications require Apple Developer account
- ⚠️ Service Worker debugging is painful

**Mitigation:**
- Cache explanations aggressively
- Start with web push (no iOS initially)
- Use Chrome DevTools → Application → Service Workers

---

## 🗓️ WEEK 4: Scale & Polish (Days 22-30)

### **Milestone:** Production-Grade Platform

#### **Task 4.1: API Platform & Rate Limiting** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🔥 Critical

**Goal:** Developer-ready API with tiered access

**Implementation:**

**Step 4.1.1: API Key Management**
```typescript
// src/middleware/auth.ts (enhance)
import { createClient } from '@supabase/supabase-js'

export async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key']

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' })
  }

  const { data: key } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', apiKey)
    .single()

  if (!key || !key.active) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  // Attach tier info to request
  req.apiTier = key.tier // 'free' | 'pro' | 'enterprise'
  req.userId = key.user_id

  next()
}
```

**Step 4.1.2: Rate Limiting**
```typescript
// src/middleware/rateLimiter.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

export async function rateLimiter(req, res, next) {
  const key = `ratelimit:${req.apiTier}:${req.userId}`

  const limits = {
    free: { requests: 100, window: 3600 }, // 100/hour
    pro: { requests: 1000, window: 3600 }, // 1000/hour
    enterprise: { requests: 10000, window: 3600 } // 10k/hour
  }

  const limit = limits[req.apiTier]
  const current = await redis.incr(key)

  if (current === 1) {
    await redis.expire(key, limit.window)
  }

  res.setHeader('X-RateLimit-Limit', limit.requests)
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.requests - current))

  if (current > limit.requests) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  next()
}
```

**Step 4.1.3: API Documentation**
```typescript
// Use existing api/openapi-spec.yaml
// Enhance with:
// - Authentication section
// - Rate limit headers
// - Example requests/responses
// - SDKs (Python, TypeScript)
```

**Files to Modify:**
```
src/middleware/auth.ts                 ← Enhance API key validation
src/middleware/rateLimiter.ts          ← CREATE
api/openapi-spec.yaml                  ← Enhance docs
supabase/migrations/20260208_api_keys.sql ← CREATE: api_keys table
client/src/pages/Settings/APIKeys.tsx  ← CREATE: Key management UI
```

**API Tiers:**
| Tier | Requests/Hour | Cost/Month | Features |
|------|---------------|------------|----------|
| Free | 100 | $0 | Basic factors, delayed data |
| Pro | 1,000 | $49 | All factors, real-time data |
| Enterprise | 10,000 | $499 | Webhooks, priority support |

**Acceptance Criteria:**
- [ ] Generate API keys in settings
- [ ] Rate limits enforced per tier
- [ ] 429 response when limit exceeded
- [ ] API docs include auth section
- [ ] Track API usage per user

---

#### **Task 4.2: Performance Optimization** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** <50ms API latency, Lighthouse 95+

**Optimizations:**

**Opt 4.2.1: Edge Functions**
```typescript
// api/edge/quotes.ts - Vercel Edge Function
export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  const { symbol } = await req.json()

  // Cache in edge (Vercel Edge Network)
  const cached = await cache.get(`quote:${symbol}`)
  if (cached && Date.now() - cached.timestamp < 1000) {
    return new Response(JSON.stringify(cached.data))
  }

  // Fetch from origin
  const quote = await fetchQuote(symbol)
  await cache.set(`quote:${symbol}`, { data: quote, timestamp: Date.now() })

  return new Response(JSON.stringify(quote))
}
```

**Opt 4.2.2: Code Splitting**
```typescript
// client/src/App.tsx
import { lazy, Suspense } from 'react'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const CVRF = lazy(() => import('./pages/CVRF'))
const Earnings = lazy(() => import('./pages/Earnings'))

// Lazy load heavy components
// Result: Initial bundle 120KB → 45KB
```

**Opt 4.2.3: Database Indexes**
```sql
-- supabase/migrations/20260208_indexes.sql
CREATE INDEX idx_episodes_user_date ON episodes(user_id, start_date DESC);
CREATE INDEX idx_decisions_episode_timestamp ON decisions(episode_id, timestamp DESC);
CREATE INDEX idx_belief_states_user_version ON belief_states(user_id, version DESC);

-- Materialized view for factor performance
CREATE MATERIALIZED VIEW factor_performance_daily AS
SELECT
  date_trunc('day', timestamp) as date,
  symbol,
  factor_name,
  avg(exposure) as avg_exposure,
  stddev(exposure) as volatility
FROM factor_exposures
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX ON factor_performance_daily(date, symbol, factor_name);
```

**Opt 4.2.4: Image Optimization**
```typescript
// client/vite.config.ts
import { defineConfig } from 'vite'
import imagemin from 'vite-plugin-imagemin'

export default defineConfig({
  plugins: [
    imagemin({
      gifsicle: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      pngquant: { quality: [0.8, 0.9], speed: 4 },
      svgo: {
        plugins: [{ name: 'removeViewBox', active: false }]
      }
    })
  ]
})
```

**Files to Modify:**
```
api/edge/quotes.ts                     ← CREATE: Edge function
client/src/App.tsx                     ← Add lazy loading
client/vite.config.ts                  ← Add optimizations
supabase/migrations/20260208_indexes.sql ← CREATE
vercel.json                            ← Add edge config
```

**Acceptance Criteria:**
- [ ] API latency p95 <50ms
- [ ] Initial page load <1.5s
- [ ] Lighthouse Performance >95
- [ ] Bundle size <150KB (gzip)
- [ ] TTI (Time to Interactive) <2s

**Verification:**
```bash
# Run Lighthouse
npm run build
npx lighthouse http://localhost:3000 --view

# Check bundle size
npm run build
ls -lh client/dist/assets/*.js
```

---

#### **Task 4.3: Observability Stack** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🟡 High

**Goal:** Full monitoring + error tracking

**Implementation:**

**Step 4.3.1: Structured Logging**
```typescript
// src/observability/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  },
  base: {
    env: process.env.NODE_ENV,
    app: 'frontier-alpha'
  }
})

// Usage:
logger.info({ userId, symbol }, 'Portfolio rebalanced')
logger.error({ err, userId }, 'Failed to fetch quotes')
```

**Step 4.3.2: Sentry Enhancement**
```typescript
// client/src/lib/sentry.ts (exists, enhance)
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `frontier-alpha@${__APP_VERSION__}`,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: true
    })
  ]
})

// Tag users
Sentry.setUser({ id: userId, email: userEmail })

// Custom context
Sentry.setContext('portfolio', {
  symbols: portfolio.symbols,
  value: portfolio.totalValue
})
```

**Step 4.3.3: Performance Monitoring**
```typescript
// src/observability/metrics.ts
import { performance } from 'perf_hooks'

export class Metrics {
  static async trackApiCall(name: string, fn: () => Promise<any>) {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = performance.now() - start

      logger.info({ name, duration, success: true }, 'API call')
      return result
    } catch (err) {
      const duration = performance.now() - start
      logger.error({ name, duration, success: false, err }, 'API call failed')
      throw err
    }
  }
}
```

**Files to Modify:**
```
src/observability/logger.ts            ← CREATE
src/observability/metrics.ts           ← CREATE
src/observability/index.ts             ← Exports
client/src/lib/sentry.ts               ← Enhance
src/index.ts                           ← Add request logging
package.json                           ← Add pino
```

**Acceptance Criteria:**
- [ ] All API calls logged with duration
- [ ] Errors auto-reported to Sentry
- [ ] User context attached to errors
- [ ] Performance tracking for key operations
- [ ] Daily error digest email

---

#### **Task 4.4: Documentation & Polish** ⏱️ 2 days
**Status:** 🔵 Queued
**Priority:** 🟢 Medium

**Goal:** Production-ready docs + final polish

**Documentation:**

**Doc 4.4.1: API Reference**
```markdown
# docs/API.md
## Authentication
## Endpoints
## Rate Limits
## SDKs
## Examples
```

**Doc 4.4.2: User Guide**
```markdown
# docs/USER_GUIDE.md
## Getting Started
## Understanding Factors
## Interpreting CVRF
## Earnings Forecasts
## Risk Management
```

**Doc 4.4.3: Developer Guide**
```markdown
# docs/DEVELOPER.md
## Architecture
## Local Development
## Testing
## Deployment
## Contributing
```

**Polish Items:**
- [ ] Add loading skeletons (avoid flash of empty content)
- [ ] Error boundary with helpful messages
- [ ] Empty states with CTAs
- [ ] Keyboard shortcuts (? to show help)
- [ ] Dark mode persists across sessions
- [ ] Responsive tables on mobile
- [ ] Print-friendly portfolio reports

**Files to Modify:**
```
docs/API.md                            ← CREATE
docs/USER_GUIDE.md                     ← CREATE
docs/DEVELOPER.md                      ← CREATE
README.md                              ← Update with Phase 1 features
CHANGELOG.md                           ← CREATE
client/src/components/ErrorBoundary.tsx ← CREATE
client/src/components/EmptyState.tsx   ← CREATE
client/src/components/LoadingSkeleton.tsx ← CREATE
```

---

### **Week 4 Checkpoint**

**Exit Criteria:**
- [ ] API keys working with rate limits
- [ ] Lighthouse score >95
- [ ] Sentry capturing errors
- [ ] All docs complete
- [ ] Zero critical bugs

**Deliverable:** Production-ready platform

**Estimated Time:** 8 days (45-55 hours)

---

## 📊 Phase 1 Success Metrics

### **Technical Metrics**
| Metric | Target | Actual |
|--------|--------|--------|
| Test Coverage | >80% | - |
| API Latency (p95) | <50ms | - |
| Lighthouse Score | >95 | - |
| Uptime | >99.5% | - |
| Error Rate | <0.1% | - |

### **Product Metrics**
| Metric | Target | Actual |
|--------|--------|--------|
| CVRF Alpha | +2% annual vs static | - |
| Earnings Forecast Accuracy | >70% | - |
| User Retention (7d) | >40% | - |
| Mobile Usage | >30% | - |
| API Adoption | 10+ developers | - |

### **Business Metrics**
| Metric | Target | Actual |
|--------|--------|--------|
| Demo-Ready | Yes | - |
| Investor Pitch Deck | Yes | - |
| Beta Users | 50+ | - |

---

## 🚀 Next Steps After Phase 1

### **Phase 2 Options (Pick 1-2):**
1. **ML Engine Activation** - Deep learning factors, regime detection
2. **Social Features** - Leaderboards, shared portfolios, discussions
3. **Options Intelligence** - Implied vol forecasts, strategies
4. **Tax Optimization** - Tax-loss harvesting, wash sale detection
5. **Institutional Tier** - Multi-account, white-label, API enterprise

---

## 📝 Session Handoff Protocol

When starting a new Claude Code session, use this prompt:

```
Load Phase 1 Master Plan from ~/frontier-alpha/PHASE_1_MASTER_PLAN.md

Current status:
- Week: [1|2|3|4]
- Task: [Task ID from plan]
- Blockers: [Any issues]

Continue where I left off. Check task status, run any verification commands, and proceed to next subtask.
```

---

## 🔧 Common Commands Reference

```bash
# Development
npm run dev                    # Start dev server
npm run dev:all                # Start server + client
cd client && npm run dev       # Client only

# Testing
npm test                       # Run all tests
npm run test:coverage          # With coverage report
cd client && npm test          # Client tests only

# Database
npm run db:migrate             # Apply migrations
npm run db:reset               # Reset database
npx supabase db push           # Push schema changes

# Deployment
git push origin main           # Auto-deploys to Vercel
vercel --prod                  # Manual production deploy

# Debugging
npm run lint                   # Check linting
npm run build                  # Test production build
vercel dev                     # Test serverless functions locally
```

---

## 📞 Support & Resources

- **GitHub Repo:** https://github.com/Dicoangelo/frontier-alpha
- **Vercel Dashboard:** https://vercel.com/dicoangelo
- **Supabase Dashboard:** https://supabase.com/dashboard
- **Polygon.io Docs:** https://polygon.io/docs
- **Alpaca Docs:** https://alpaca.markets/docs

---

**Version:** 1.0.0
**Last Updated:** 2026-02-08
**Maintained By:** Claude Code + Dicoangelo
**License:** MIT
