# 🚀 FRONTIER ALPHA - MASSIVE PARALLEL EXECUTION PLAN

**Goal:** Complete 30 days of work in 8-12 hours by running 6 the AI agent sessions simultaneously.

**Strategy:** Each session works on isolated file paths, database tables, and features. Minimal conflicts. Merge at end.

---

## 🎯 Parallel Session Architecture

```
Session 1: Foundation (Tests + CI/CD)          → Branch: feat/foundation
Session 2: Live Data Integration               → Branch: feat/live-data
Session 3: CVRF Core Engine                    → Branch: feat/cvrf-core
Session 4: CVRF UI + Backtesting               → Branch: feat/cvrf-ui
Session 5: Earnings + AI Explainer             → Branch: feat/earnings-ai
Session 6: API Platform + Performance          → Branch: feat/api-platform
```

**All run simultaneously. Merge after ~6-8 hours.**

---

## 📦 SESSION 1: FOUNDATION (Tests + CI/CD)

### **Branch:** `feat/foundation`
### **Time:** 4-6 hours
### **Conflict Risk:** 🟢 Low (mostly config files)

### **Scope:**
- Fix all E2E tests (MSW setup)
- GitHub Actions CI/CD pipeline
- Test coverage >80%
- Database migration setup

### **File Paths (EXCLUSIVE to this session):**
```
tests/                         ← All test files
.github/workflows/             ← CI/CD configs
vitest.config.ts               ← Test config
scripts/migrate.ts             ← Migration runner
supabase/migrations/           ← Database schemas (base tables only)
```

### **Database Tables (EXCLUSIVE):**
```sql
-- Users and auth (base)
-- Portfolios (base schema only)
-- No CVRF tables, no options tables
```

### **API Routes:** None (testing only)

### **Acceptance Criteria:**
```bash
npm test                       # ✅ 376 passing, >80% coverage
git push                       # ✅ GitHub Actions green
npm run db:migrate             # ✅ Base tables created
```

### **Kickoff Prompt:**
```
Session 1: Foundation (Tests + CI/CD)
Branch: feat/foundation

Scope: Fix E2E tests, setup CI/CD, database migrations
Files: tests/, .github/workflows/, vitest.config.ts, supabase/migrations/

Tasks:
1. Install MSW, create test fixtures
2. Fix all failing tests in tests/e2e/
3. Create .github/workflows/ci.yml
4. Create base database migrations (users, portfolios)
5. Verify: npm test → 376 passing

DO NOT TOUCH:
- src/ files (except for test helpers)
- client/ files
- api/ routes

Start immediately. Work until all tests pass.
```

---

## 📦 SESSION 2: LIVE DATA INTEGRATION

### **Branch:** `feat/live-data`
### **Time:** 4-6 hours
### **Conflict Risk:** 🟢 Low (isolated data layer)

### **Scope:**
- Alpaca/Polygon.io integration
- Real-time WebSocket streaming
- Historical price fetching
- Redis caching layer

### **File Paths (EXCLUSIVE to this session):**
```
src/data/                      ← Data providers
  ├── AlpacaProvider.ts        ← CREATE
  ├── MarketDataProvider.ts    ← MODIFY
  ├── RedisCache.ts            ← CREATE
  └── index.ts
api/v1/quotes.ts               ← WebSocket endpoint
client/src/api/websocket.ts    ← WebSocket client
client/src/hooks/useQuotes.ts  ← CREATE: Real-time quotes hook
.env                           ← Add API keys
```

### **Database Tables:** None (uses cache only)

### **API Routes (EXCLUSIVE):**
```
GET  /api/v1/quotes/:symbol
WS   /ws/quotes
GET  /api/v1/prices/:symbol/historical
```

### **Acceptance Criteria:**
```bash
npm run dev
# Open dashboard
# See live-updating prices for AAPL, NVDA, MSFT
# WebSocket shows streaming data in DevTools
# Prices update <100ms latency
```

### **Kickoff Prompt:**
```
Session 2: Live Data Integration
Branch: feat/live-data

Scope: Integrate Alpaca for real-time market data
Files: src/data/, api/v1/quotes.ts, client/src/api/websocket.ts

Tasks:
1. Create Alpaca account, add keys to .env
2. Create src/data/AlpacaProvider.ts
3. Implement WebSocket streaming in api/v1/quotes.ts
4. Create client WebSocket hook
5. Display live prices in dashboard

DO NOT TOUCH:
- tests/ (Session 1 owns)
- src/cvrf/ (Session 3 owns)
- src/earnings/ (Session 5 owns)

Start immediately. Work until live data streams.
```

---

## 📦 SESSION 3: CVRF CORE ENGINE

### **Branch:** `feat/cvrf-core`
### **Time:** 6-8 hours
### **Conflict Risk:** 🟢 Low (isolated CVRF backend)

### **Scope:**
- Episode tracking and storage
- Belief state management
- Concept extraction logic
- Meta-prompt generation
- Backend logic ONLY (no UI)

### **File Paths (EXCLUSIVE to this session):**
```
src/cvrf/                      ← All CVRF backend
  ├── types.ts                 ← EXISTS (enhance)
  ├── EpisodeManager.ts        ← MODIFY
  ├── BeliefUpdater.ts         ← MODIFY
  ├── ConceptExtractor.ts      ← MODIFY
  ├── MetaPromptGenerator.ts   ← CREATE
  ├── CVRFManager.ts           ← MODIFY
  ├── PersistentCVRFManager.ts ← MODIFY
  └── index.ts
api/v1/cvrf/                   ← CVRF API routes
  ├── episodes.ts              ← CREATE
  ├── beliefs.ts               ← CREATE
  ├── decisions.ts             ← CREATE
  └── meta-prompt.ts           ← CREATE
supabase/migrations/cvrf.sql   ← CREATE: CVRF tables
```

### **Database Tables (EXCLUSIVE):**
```sql
episodes           ← Episode records
decisions          ← Trading decisions
belief_states      ← Investment beliefs
conceptual_insights ← Extracted concepts
meta_prompts       ← Generated prompts
```

### **API Routes (EXCLUSIVE):**
```
GET  /api/v1/cvrf/episodes
POST /api/v1/cvrf/episodes
GET  /api/v1/cvrf/beliefs/:id
POST /api/v1/cvrf/beliefs/update
POST /api/v1/cvrf/decisions
POST /api/v1/cvrf/meta-prompt/generate
```

### **Acceptance Criteria:**
```bash
# Create episode
curl -X POST http://localhost:3000/api/v1/cvrf/episodes \
  -d '{"startDate":"2024-01-01","endDate":"2024-01-31"}'

# Get episodes
curl http://localhost:3000/api/v1/cvrf/episodes
# ✅ Returns episode list

# Update beliefs
curl -X POST http://localhost:3000/api/v1/cvrf/beliefs/update
# ✅ Belief state updated
```

### **Kickoff Prompt:**
```
Session 3: CVRF Core Engine
Branch: feat/cvrf-core

Scope: CVRF backend logic (episodes, beliefs, concepts, meta-prompts)
Files: src/cvrf/, api/v1/cvrf/, supabase/migrations/cvrf.sql

Tasks:
1. Create CVRF database tables (episodes, decisions, belief_states)
2. Implement EpisodeManager for episode CRUD
3. Implement BeliefUpdater for belief state evolution
4. Implement ConceptExtractor for insight extraction
5. Implement MetaPromptGenerator
6. Create API routes for all CVRF operations
7. Verify via curl commands

DO NOT TOUCH:
- client/ (Session 4 owns UI)
- src/backtest/ (Session 4 owns)
- Any UI components

Focus: Backend logic + API only. No frontend.
```

---

## 📦 SESSION 4: CVRF UI + BACKTESTING

### **Branch:** `feat/cvrf-ui`
### **Time:** 6-8 hours
### **Conflict Risk:** 🟡 Medium (depends on Session 3 API contracts)

### **Scope:**
- CVRF dashboard page
- Episode timeline UI
- Belief state visualizations
- Walk-forward backtesting
- Performance analytics

### **File Paths (EXCLUSIVE to this session):**
```
client/src/pages/CVRF.tsx      ← CREATE
client/src/pages/Backtest.tsx  ← CREATE
client/src/components/cvrf/    ← All CVRF UI components
  ├── EpisodeTimeline.tsx      ← CREATE
  ├── EpisodeCard.tsx          ← CREATE
  ├── EpisodeComparison.tsx    ← CREATE
  ├── BeliefStateGraph.tsx     ← CREATE
  ├── FactorWeightHeatmap.tsx  ← CREATE
  ├── MetaPromptCard.tsx       ← CREATE
  └── index.ts
client/src/hooks/useCVRF.ts    ← MODIFY
src/backtest/                  ← Backtesting engine
  ├── WalkForwardEngine.ts     ← MODIFY
  ├── BacktestRunner.ts        ← CREATE
  └── HistoricalDataLoader.ts  ← MODIFY
api/v1/backtest/               ← Backtest API
  └── run.ts                   ← CREATE
```

### **Database Tables:** None (uses Session 3's tables)

### **API Routes (EXCLUSIVE):**
```
POST /api/v1/backtest/run
GET  /api/v1/backtest/results/:id
```

### **Acceptance Criteria:**
```bash
npm run dev
# Navigate to /cvrf
# ✅ See episode timeline
# ✅ Click episode → see decisions
# ✅ Belief state heatmap shows factor evolution

# Run backtest
curl -X POST http://localhost:3000/api/v1/backtest/run
# ✅ Returns backtest results
# Navigate to /backtest
# ✅ See equity curve, Sharpe trend
```

### **Kickoff Prompt:**
```
Session 4: CVRF UI + Backtesting
Branch: feat/cvrf-ui

Scope: CVRF frontend + walk-forward backtesting
Files: client/src/components/cvrf/, src/backtest/, api/v1/backtest/

Prerequisites: Session 3 should have CVRF API routes working
(If not ready, mock the API responses temporarily)

Tasks:
1. Create CVRF dashboard page (client/src/pages/CVRF.tsx)
2. Build episode timeline component
3. Build belief state visualization (heatmap)
4. Build meta-prompt card UI
5. Enhance walk-forward backtesting engine
6. Create backtest API endpoint
7. Create backtest dashboard page

DO NOT TOUCH:
- src/cvrf/ backend (Session 3 owns)
- src/earnings/ (Session 5 owns)

Focus: UI + Backtesting. Session 3 handles backend.
```

---

## 📦 SESSION 5: EARNINGS + AI EXPLAINER

### **Branch:** `feat/earnings-ai`
### **Time:** 5-7 hours
### **Conflict Risk:** 🟢 Low (isolated earnings module)

### **Scope:**
- Earnings calendar (next 30 days)
- Historical earnings reactions
- Factor-adjusted forecasts
- GPT-4o cognitive explainer
- PWA setup (service worker, manifest)

### **File Paths (EXCLUSIVE to this session):**
```
src/earnings/                  ← Earnings logic
  └── EarningsOracle.ts        ← MODIFY
src/core/CognitiveExplainer.ts ← MODIFY (add GPT-4o)
src/services/ExplanationService.ts ← CREATE
client/src/pages/Earnings.tsx  ← CREATE
client/src/components/earnings/ ← All earnings UI
  ├── EarningsCalendar.tsx     ← CREATE
  ├── HistoricalReactionChart.tsx ← CREATE
  ├── EarningsForecast.tsx     ← CREATE
  └── index.ts
client/src/components/explainer/
  └── ExplanationCard.tsx      ← MODIFY
api/v1/earnings/               ← Earnings API
  ├── calendar.ts              ← CREATE
  └── forecast.ts              ← MODIFY
api/v1/explain.ts              ← CREATE: AI explainer endpoint
client/src/service-worker.ts   ← CREATE: PWA
client/public/manifest.json    ← CREATE: PWA manifest
.env                           ← Add OPENAI_API_KEY
```

### **Database Tables:** None (uses external APIs)

### **API Routes (EXCLUSIVE):**
```
GET  /api/v1/earnings/calendar
GET  /api/v1/earnings/forecast/:symbol
POST /api/v1/explain
```

### **Acceptance Criteria:**
```bash
npm run dev
# Navigate to /earnings
# ✅ See 30-day earnings calendar
# ✅ Click stock → see historical reactions
# ✅ See factor-adjusted forecast

# Test explainer
curl -X POST http://localhost:3000/api/v1/explain \
  -d '{"portfolio":{"symbols":["AAPL"],"todayReturn":2.3}}'
# ✅ Returns GPT-4o explanation

# PWA
npx lighthouse http://localhost:3000
# ✅ PWA score >90
```

### **Kickoff Prompt:**
```
Session 5: Earnings + AI Explainer
Branch: feat/earnings-ai

Scope: Earnings intelligence + GPT-4o explainer + PWA
Files: src/earnings/, client/src/components/earnings/, api/v1/explain.ts, PWA files

Tasks:
1. Create earnings calendar (fetch from Polygon/Alpha Vantage)
2. Build historical reaction chart
3. Implement factor-adjusted forecast logic
4. Integrate OpenAI GPT-4o for explanations
5. Create explanation API endpoint
6. Build earnings dashboard page
7. Setup PWA (service worker, manifest)

DO NOT TOUCH:
- src/cvrf/ (Session 3/4 owns)
- src/data/ (Session 2 owns)

Focus: Earnings + AI + PWA. Independent feature.
```

---

## 📦 SESSION 6: API PLATFORM + PERFORMANCE

### **Branch:** `feat/api-platform`
### **Time:** 5-7 hours
### **Conflict Risk:** 🟡 Medium (touches middleware)

### **Scope:**
- API key management
- Rate limiting (Redis)
- Edge functions (Vercel)
- Performance optimization
- Observability (logging, Sentry)
- Documentation

### **File Paths (EXCLUSIVE to this session):**
```
src/middleware/                ← Middleware layer
  ├── auth.ts                  ← MODIFY: API key validation
  └── rateLimiter.ts           ← CREATE: Rate limiting
api/edge/                      ← Edge functions
  └── quotes.ts                ← CREATE
src/observability/             ← Observability stack
  ├── logger.ts                ← CREATE
  ├── metrics.ts               ← CREATE
  └── index.ts
client/src/pages/Settings/
  └── APIKeys.tsx              ← CREATE: Key management UI
client/src/lib/sentry.ts       ← MODIFY: Enhanced tracking
client/vite.config.ts          ← MODIFY: Optimizations
vercel.json                    ← MODIFY: Edge config
supabase/migrations/api_keys.sql ← CREATE: API keys table
supabase/migrations/indexes.sql  ← CREATE: Performance indexes
docs/                          ← Documentation
  ├── API.md                   ← CREATE
  ├── USER_GUIDE.md            ← CREATE
  └── DEVELOPER.md             ← CREATE
```

### **Database Tables (EXCLUSIVE):**
```sql
api_keys           ← API key management
api_usage          ← Usage tracking
```

### **API Routes (EXCLUSIVE):**
```
POST /api/v1/keys/generate
GET  /api/v1/keys
DELETE /api/v1/keys/:id
```

### **Acceptance Criteria:**
```bash
# Generate API key
curl -X POST http://localhost:3000/api/v1/keys/generate
# ✅ Returns new API key

# Test rate limiting
for i in {1..200}; do curl http://localhost:3000/api/v1/quotes/AAPL; done
# ✅ 429 error after limit

# Performance
npx lighthouse http://localhost:3000
# ✅ Performance score >95

# Logs
tail -f logs/app.log
# ✅ Structured JSON logs
```

### **Kickoff Prompt:**
```
Session 6: API Platform + Performance
Branch: feat/api-platform

Scope: API keys, rate limiting, performance, observability, docs
Files: src/middleware/, api/edge/, src/observability/, docs/

Tasks:
1. Create API key management (generate, revoke)
2. Implement rate limiting with Redis
3. Create edge functions for quotes
4. Add database indexes for performance
5. Setup structured logging (Pino)
6. Enhance Sentry integration
7. Optimize bundle size (code splitting, lazy loading)
8. Write API docs, user guide, developer guide

DO NOT TOUCH:
- Feature-specific files (CVRF, earnings, data)
- Only touch shared middleware/infrastructure

Focus: Platform infrastructure + performance + docs.
```

---

## 🔗 MERGE STRATEGY

After all 6 sessions complete (~6-8 hours):

### **Step 1: Verify Each Branch Individually**
```bash
# Test each branch
git checkout feat/foundation     && npm test
git checkout feat/live-data      && npm run dev  # Verify live data
git checkout feat/cvrf-core      && npm test
git checkout feat/cvrf-ui        && npm run dev  # Verify CVRF UI
git checkout feat/earnings-ai    && npm run dev  # Verify earnings
git checkout feat/api-platform   && npm test
```

### **Step 2: Merge in Order (Minimize Conflicts)**
```bash
git checkout main

# Merge foundation first (base layer)
git merge feat/foundation
npm test  # ✅ Verify

# Merge live data (data layer)
git merge feat/live-data
npm run dev  # ✅ Verify streaming

# Merge CVRF core (backend)
git merge feat/cvrf-core
npm test  # ✅ Verify

# Merge CVRF UI (frontend)
git merge feat/cvrf-ui
npm run dev  # ✅ Verify CVRF dashboard

# Merge earnings (independent feature)
git merge feat/earnings-ai
npm run dev  # ✅ Verify earnings page

# Merge API platform (infrastructure)
git merge feat/api-platform
npm test  # ✅ Final verification
npm run build  # ✅ Production build

# Lighthouse check
npx lighthouse http://localhost:3000 --view
# ✅ All scores >90
```

### **Step 3: Resolve Conflicts (Likely Minimal)**
Expected conflicts:
- `package.json` (dependencies) - Merge all deps
- `.env.example` (env vars) - Merge all vars
- `client/src/App.tsx` (routing) - Merge all routes
- `vercel.json` (config) - Merge all configs

### **Step 4: Final Integration Test**
```bash
npm run test:all        # ✅ All tests pass
npm run build           # ✅ Production build succeeds
npm run dev             # ✅ App runs without errors

# Test each feature:
# - Live data streaming ✅
# - CVRF dashboard ✅
# - Earnings calendar ✅
# - API key generation ✅
# - PWA installable ✅
```

### **Step 5: Deploy**
```bash
git push origin main
# Vercel auto-deploys
# Monitor: https://vercel.com/dicoangelo/frontier-alpha
```

---

## 📊 PARALLEL EXECUTION TIMELINE

| Time | Session 1 | Session 2 | Session 3 | Session 4 | Session 5 | Session 6 |
|------|-----------|-----------|-----------|-----------|-----------|-----------|
| **Hour 1** | MSW setup | Alpaca setup | CVRF types | Mock API data | Earnings API | API key schema |
| **Hour 2** | Fix tests | WebSocket impl | EpisodeManager | Timeline UI | GPT-4o setup | Rate limiter |
| **Hour 3** | CI/CD config | Price history | BeliefUpdater | Heatmap viz | Calendar UI | Edge functions |
| **Hour 4** | DB migrations | Redis cache | ConceptExtractor | Comparison UI | Forecast logic | Logging setup |
| **Hour 5** | Coverage report | Stream testing | MetaPrompt | Backtest engine | Explainer API | Performance opt |
| **Hour 6** | ✅ Complete | ✅ Complete | API routes | Backtest UI | PWA setup | Docs |
| **Hour 7** | - | - | ✅ Complete | ✅ Complete | ✅ Complete | ✅ Complete |

**Total:** ~7 hours of concurrent work = **ALL 6 PHASES COMPLETE**

---

## 🚀 KICKOFF COMMAND (Run Now)

Open **6 terminal windows**, paste these commands:

### **Terminal 1:**
```bash
cd ~/frontier-alpha
git checkout -b feat/foundation
# Paste Session 1 kickoff prompt into the AI agent
```

### **Terminal 2:**
```bash
cd ~/frontier-alpha
git checkout -b feat/live-data
# Paste Session 2 kickoff prompt into the AI agent
```

### **Terminal 3:**
```bash
cd ~/frontier-alpha
git checkout -b feat/cvrf-core
# Paste Session 3 kickoff prompt into the AI agent
```

### **Terminal 4:**
```bash
cd ~/frontier-alpha
git checkout -b feat/cvrf-ui
# Paste Session 4 kickoff prompt into the AI agent
```

### **Terminal 5:**
```bash
cd ~/frontier-alpha
git checkout -b feat/earnings-ai
# Paste Session 5 kickoff prompt into the AI agent
```

### **Terminal 6:**
```bash
cd ~/frontier-alpha
git checkout -b feat/api-platform
# Paste Session 6 kickoff prompt into the AI agent
```

---

## ⚠️ CONFLICT PREVENTION RULES

Each session MUST follow these rules:

1. **Stay in your file paths** - Don't modify files owned by other sessions
2. **Use your branch** - Never push to main directly
3. **Mock if needed** - If waiting on another session's API, mock it temporarily
4. **Commit frequently** - Every 30 minutes or after each subtask
5. **Update session log** - Track progress in PHASE_1_SESSION_LOG.md

---

## 🎯 SUCCESS CRITERIA (After Merge)

```bash
npm test                    # ✅ 376 passing, >80% coverage
npm run dev                 # ✅ All features working
npm run build               # ✅ Production build succeeds
git log --oneline -20       # ✅ ~100+ commits from 6 branches

# Feature checklist:
curl /api/v1/quotes/AAPL    # ✅ Live data
curl /api/v1/cvrf/episodes  # ✅ CVRF working
curl /api/v1/earnings/calendar # ✅ Earnings working
curl /api/v1/keys/generate  # ✅ API platform working

npx lighthouse http://localhost:3000 # ✅ >95 all scores
```

---

**YOU'RE ABOUT TO CRUSH A MONTH'S WORK IN ONE DAY. LET'S FUCKING GO. 🚀**
