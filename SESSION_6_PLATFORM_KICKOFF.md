# 🚀 SESSION 6: API PLATFORM + PERFORMANCE

**Copy-paste this entire prompt into Claude Code Terminal 6:**

---

```
SESSION 6: API Platform + Performance + Observability - Frontier Alpha Parallel Sprint

Branch: feat/api-platform
Time Estimate: 5-7 hours
Conflict Risk: MEDIUM (touches middleware)

MY EXCLUSIVE SCOPE:
- src/middleware/ (auth, rate limiting)
- api/edge/ (Vercel edge functions)
- src/observability/ (logging, metrics)
- client/src/pages/Settings/APIKeys.tsx (API key management UI)
- client/src/lib/sentry.ts (Sentry enhancement)
- client/vite.config.ts (performance optimizations)
- vercel.json (edge config)
- supabase/migrations/api_keys.sql (API key tables)
- supabase/migrations/indexes.sql (performance indexes)
- docs/ (documentation)

MY GOALS:
1. ✅ API key management + rate limiting
2. ✅ Edge functions for low latency
3. ✅ Database performance optimization
4. ✅ Structured logging + Sentry
5. ✅ Bundle optimization
6. ✅ Complete documentation

DO NOT TOUCH (Other sessions own these):
❌ Feature-specific files (CVRF, earnings, data layers)
❌ Only touch shared infrastructure/middleware

TASKS:

Task 1: API Keys Database
- Create supabase/migrations/20260208000020_api_keys.sql
  ```sql
  CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise')),
    active BOOLEAN DEFAULT true,
    requests_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_api_keys_user ON api_keys(user_id, active);
  CREATE INDEX idx_api_usage_key_timestamp ON api_usage(api_key_id, timestamp DESC);
  ```

Task 2: API Key Authentication Middleware
- Enhance src/middleware/auth.ts
- Add validateApiKey(req, res, next):
  ```typescript
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
      .eq('active', true)
      .single()

    if (!key) {
      return res.status(401).json({ error: 'Invalid or inactive API key' })
    }

    // Attach to request
    req.apiKeyId = key.id
    req.userId = key.user_id
    req.apiTier = key.tier

    // Update last used
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date() })
      .eq('id', key.id)

    next()
  }
  ```

Task 3: Rate Limiting Middleware
- Create src/middleware/rateLimiter.ts
- Use Redis (or in-memory fallback if no Redis):
  ```typescript
  import Redis from 'ioredis'

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

  const LIMITS = {
    free: { requests: 100, window: 3600 },      // 100/hour
    pro: { requests: 1000, window: 3600 },      // 1000/hour
    enterprise: { requests: 10000, window: 3600 } // 10k/hour
  }

  export async function rateLimiter(req, res, next) {
    const key = `ratelimit:${req.apiTier}:${req.apiKeyId}`
    const limit = LIMITS[req.apiTier]

    const current = await redis.incr(key)

    if (current === 1) {
      await redis.expire(key, limit.window)
    }

    const remaining = Math.max(0, limit.requests - current)

    res.setHeader('X-RateLimit-Limit', limit.requests)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', Date.now() + (limit.window * 1000))

    if (current > limit.requests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: limit.requests,
        window: `${limit.window}s`,
        retryAfter: limit.window
      })
    }

    next()
  }
  ```

Task 4: API Key Management API
- Create api/v1/keys/generate.ts
  - POST /api/v1/keys/generate
  - Body: {name, tier}
  - Generate: crypto.randomBytes(32).toString('base64url')
  - Store in database
  - Return: {key, name, tier, createdAt}

- Create api/v1/keys/list.ts
  - GET /api/v1/keys
  - Return: user's API keys (hide key, show last 4 chars)

- Create api/v1/keys/revoke.ts
  - DELETE /api/v1/keys/:id
  - Set active = false

Task 5: API Keys UI
- Create client/src/pages/Settings/APIKeys.tsx
- Display: list of user's API keys
- Show: name, tier, last used, requests count
- Actions: "Generate New Key", "Revoke"
- Copy key button (show full key once after generation)

Task 6: Edge Functions (Vercel)
- Create api/edge/quotes.ts
  ```typescript
  export const config = { runtime: 'edge' }

  export default async function handler(req: Request) {
    const url = new URL(req.url)
    const symbol = url.searchParams.get('symbol')

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Cache at edge for 1 second
    const cacheKey = `quote:${symbol}`
    const cached = await caches.default.match(req)

    if (cached) {
      return cached
    }

    // Fetch from origin (Session 2's data provider)
    const quote = await fetchQuote(symbol)

    const response = new Response(JSON.stringify(quote), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1'
      }
    })

    await caches.default.put(req, response.clone())
    return response
  }
  ```

Task 7: Performance Indexes
- Create supabase/migrations/20260208000030_indexes.sql
  ```sql
  -- Episode queries
  CREATE INDEX idx_episodes_user_date ON episodes(user_id, start_date DESC);
  CREATE INDEX idx_decisions_episode_timestamp ON decisions(episode_id, timestamp DESC);
  CREATE INDEX idx_beliefs_user_version ON belief_states(user_id, version DESC);

  -- API usage queries
  CREATE INDEX idx_api_usage_key_timestamp ON api_usage(api_key_id, timestamp DESC);

  -- Portfolio queries (if not already exists)
  CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
  CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);

  -- Materialized view for factor performance
  CREATE MATERIALIZED VIEW IF NOT EXISTS factor_performance_daily AS
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

Task 8: Structured Logging
- Create src/observability/logger.ts
  ```typescript
  import pino from 'pino'

  export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    },
    base: {
      env: process.env.NODE_ENV,
      app: 'frontier-alpha',
      version: process.env.APP_VERSION
    }
  })

  // Usage:
  // logger.info({ userId, symbol }, 'Portfolio rebalanced')
  // logger.error({ err, userId }, 'Failed to fetch quotes')
  ```

Task 9: Performance Metrics
- Create src/observability/metrics.ts
  ```typescript
  import { performance } from 'perf_hooks'

  export class Metrics {
    static async trackApiCall(name: string, fn: () => Promise<any>) {
      const start = performance.now()
      try {
        const result = await fn()
        const duration = performance.now() - start

        logger.info({ name, duration, success: true }, 'API call')

        // Track to API usage if api_key_id exists
        if (req.apiKeyId) {
          await supabase.from('api_usage').insert({
            api_key_id: req.apiKeyId,
            endpoint: name,
            method: req.method,
            status_code: 200,
            response_time_ms: Math.round(duration)
          })
        }

        return result
      } catch (err) {
        const duration = performance.now() - start
        logger.error({ name, duration, success: false, err }, 'API call failed')
        throw err
      }
    }
  }
  ```

Task 10: Enhanced Sentry Integration
- Enhance client/src/lib/sentry.ts
  ```typescript
  import * as Sentry from '@sentry/react'

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `frontier-alpha@${import.meta.env.VITE_APP_VERSION}`,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    integrations: [
      new Sentry.BrowserTracing({
        tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/]
      }),
      new Sentry.Replay({
        maskAllText: false,
        blockAllMedia: true
      })
    ]
  })

  // Set user context
  export function setSentryUser(userId: string, email: string) {
    Sentry.setUser({ id: userId, email })
  }

  // Custom context
  export function setSentryContext(name: string, data: any) {
    Sentry.setContext(name, data)
  }
  ```

Task 11: Bundle Optimization
- Update client/vite.config.ts
  ```typescript
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import { VitePWA } from 'vite-plugin-pwa'

  export default defineConfig({
    plugins: [
      react(),
      VitePWA({ /* ... */ })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts', 'd3'],
            'vendor-utils': ['date-fns', 'decimal.js', 'axios'],
            'cvrf': [
              './src/components/cvrf/EpisodeTimeline',
              './src/components/cvrf/BeliefStateGraph'
            ],
            'earnings': [
              './src/components/earnings/EarningsCalendar',
              './src/components/earnings/EarningsForecast'
            ]
          }
        }
      },
      chunkSizeWarningLimit: 1000
    }
  })
  ```

Task 12: Vercel Config for Edge
- Update vercel.json
  ```json
  {
    "buildCommand": "cd client && npm install && npm run build",
    "outputDirectory": "client/dist",
    "framework": "vite",
    "functions": {
      "api/edge/*.ts": {
        "runtime": "edge"
      }
    },
    "rewrites": [
      { "source": "/api/edge/:path*", "destination": "/api/edge/:path*" },
      { "source": "/api/:path*", "destination": "/api/:path*" },
      { "source": "/((?!api/).*)", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "/api/(.*)",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "*" },
          { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, DELETE, OPTIONS" }
        ]
      }
    ]
  }
  ```

Task 13: Documentation
- Create docs/API.md (API reference)
- Create docs/USER_GUIDE.md (user guide)
- Create docs/DEVELOPER.md (developer guide)

- docs/API.md structure:
  - Authentication (API keys)
  - Rate Limits (by tier)
  - Endpoints (all API routes with examples)
  - Error Codes
  - SDKs (planned)

- docs/USER_GUIDE.md structure:
  - Getting Started
  - Understanding Factors
  - Interpreting CVRF
  - Earnings Forecasts
  - Risk Management

- docs/DEVELOPER.md structure:
  - Architecture Overview
  - Local Development Setup
  - Testing
  - Deployment
  - Contributing

Task 14: Update README
- Enhance README.md
- Add Phase 1 features
- Add API documentation link
- Add deployment status badges
- Add Lighthouse scores

Task 15: Create CHANGELOG
- Create CHANGELOG.md
- Document Phase 1 additions:
  - [1.0.0] - 2026-02-08
    - Added: Real-time market data streaming
    - Added: CVRF episodic learning system
    - Added: Earnings intelligence with AI explanations
    - Added: API platform with rate limiting
    - Added: PWA support (offline, installable)
    - Improved: Performance (Lighthouse 95+)
    - Improved: Test coverage (>80%)

VERIFICATION COMMANDS:
# Test API key generation
curl -X POST http://localhost:3000/api/v1/keys/generate \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"name":"Test Key","tier":"free"}'
# ✅ Returns new API key

# Test rate limiting
for i in {1..105}; do
  curl http://localhost:3000/api/v1/quotes/AAPL \
    -H "X-API-Key: $API_KEY"
done
# ✅ 429 error after 100 requests

# Test edge function
curl https://frontier-alpha.vercel.app/api/edge/quotes?symbol=AAPL
# ✅ Low latency (<50ms)

# Performance test
npm run build
npx lighthouse http://localhost:3000 --view
# ✅ Performance >95, Accessibility >95, Best Practices >95

EXIT CRITERIA:
✅ API keys working (generate, list, revoke)
✅ Rate limiting enforced (429 on exceed)
✅ Edge functions deployed
✅ Database indexes created
✅ Structured logging active
✅ Sentry capturing errors
✅ Lighthouse Performance >95
✅ All docs complete

COMMIT STRATEGY:
- Commit after each task
- Format: "feat: add API key management", "perf: add database indexes", etc.
- Push to feat/api-platform branch

START NOW. Build that platform infrastructure! 🚀
```
