# 🚀 SESSION 5: EARNINGS + AI EXPLAINER

**Copy-paste this entire prompt into Claude Code Terminal 5:**

---

```
SESSION 5: Earnings + AI Explainer + PWA - Frontier Alpha Parallel Sprint

Branch: feat/earnings-ai
Time Estimate: 5-7 hours
Conflict Risk: LOW

MY EXCLUSIVE SCOPE:
- src/earnings/ (earnings logic)
- src/core/CognitiveExplainer.ts (AI explainer)
- src/services/ExplanationService.ts (explainer orchestrator)
- client/src/pages/Earnings.tsx (earnings page)
- client/src/components/earnings/ (ALL earnings UI)
- client/src/components/explainer/ (explainer UI)
- api/v1/earnings/ (earnings API)
- api/v1/explain.ts (AI explainer API)
- client/src/service-worker.ts (PWA)
- client/public/manifest.json (PWA manifest)

MY GOALS:
1. ✅ Earnings calendar (next 30 days)
2. ✅ Historical earnings reaction charts
3. ✅ Factor-adjusted earnings forecasts
4. ✅ GPT-4o cognitive explainer
5. ✅ PWA setup (installable, offline, push notifications)

DO NOT TOUCH (Other sessions own these):
❌ src/cvrf/ (Session 3/4)
❌ src/data/ (Session 2)
❌ src/middleware/ (Session 6)

TASKS:

Task 1: Earnings Calendar Data Integration
- Get Polygon.io API key (or Alpha Vantage)
- Add to .env: POLYGON_API_KEY=your_key
- Enhance src/earnings/EarningsOracle.ts
- Method: getUpcomingEarnings(days = 30): Promise<EarningsEvent[]>
  - Fetch from Polygon: GET /v3/reference/earnings
  - Parse: date, symbol, eps_actual, eps_estimate, revenue_actual, revenue_estimate
  - Filter: next 30 days
  - Sort: by date ascending

Task 2: Historical Earnings Reactions
- Method: getHistoricalReactions(symbol): Promise<EarningsReaction[]>
  - Fetch last 8 quarters of earnings
  - For each earnings date:
    - Get price 1 day before earnings
    - Get price 1 day after earnings
    - Calculate: reaction = (priceAfter - priceBefore) / priceBefore
  - Return: [{date, reaction, eps_surprise, revenue_surprise}]

Task 3: Factor-Adjusted Forecast
- Method: forecastEarningsMove(symbol, historicalReactions, factorExposures, sentiment): Forecast
  - Base expected move = avg(abs(historical reactions))
  - Factor adjustment:
    - momentum > 0.5 → increase expected move by 15%
    - volatility > 0.6 → increase by 20%
    - quality > 0.5 → decrease by 10% (stable companies)
  - Sentiment adjustment:
    - sentiment > 0.7 → decrease by 10% (high expectations)
    - sentiment < -0.7 → increase by 10% (beaten down)
  - Final forecast = base * (1 + factor_adj + sentiment_adj)
  - Return: {expectedMove, baseLine, factorAdjustment, sentimentAdjustment, confidence}

Task 4: Earnings API Routes
- Create api/v1/earnings/calendar.ts
  - GET /api/v1/earnings/calendar?days=30
  - Return: upcoming earnings for next N days

- Enhance api/v1/earnings/forecast.ts (already exists)
  - GET /api/v1/earnings/forecast/:symbol
  - Return: factor-adjusted forecast with confidence intervals

Task 5: Earnings Calendar UI
- Create client/src/pages/Earnings.tsx
- Layout: Calendar grid (days), Earnings list
- Filters: "My Holdings Only", "High Impact (>5% expected move)", "All"

- Create client/src/components/earnings/EarningsCalendar.tsx
- Group by date
- Show: symbol, time (AMC/BMC), expected move, confidence
- Click symbol → show forecast details

Task 6: Historical Reaction Chart
- Create client/src/components/earnings/HistoricalReactionChart.tsx
- Bar chart: Last 8 quarters
- X-axis: earnings date
- Y-axis: price reaction %
- Overlay: expected move (gray band) vs actual move (colored bars)
- Color: green (beat), red (miss), yellow (inline)

Task 7: Factor-Adjusted Forecast Component
- Create client/src/components/earnings/EarningsForecast.tsx
- Display:
  - Base expected move: ±8.2%
  - Factor adjustment: +1.5% (momentum surge)
  - Sentiment adjustment: -0.5% (high expectations)
  - Final forecast: ±9.2% (confidence: 72%)
- Confidence bands visualization (area chart)

Task 8: GPT-4o Cognitive Explainer
- Get OpenAI API key: https://platform.openai.com/api-keys
- Add to .env: OPENAI_API_KEY=sk-proj-...

- Enhance src/core/CognitiveExplainer.ts
- Add method: explainPortfolioMove(portfolio, factorAttribution, marketContext): Promise<Explanation>
  - Use OpenAI GPT-4o API
  - Prompt:
    ```
    You are a quantitative analyst.

    Portfolio: ${symbols}
    Today's Return: ${return}%
    Factor Attribution:
    - Momentum: +1.8%
    - Value: -0.2%
    - Volatility: +0.7%

    Market Context:
    - S&P 500: +0.5%
    - VIX: 14.2

    Explain in 2-3 sentences why this portfolio moved today.
    ```
  - Return: {text, confidence, sources}

- Add method: explainEarningsForecast(symbol, forecast, factors, sentiment): Promise<Explanation>
  - Explain why forecast is what it is
  - Reference specific factors and sentiment

Task 9: Explanation Service
- Create src/services/ExplanationService.ts
- Orchestrate different explanation types:
  - explainPortfolioMove()
  - explainRebalance()
  - explainEarningsForecast()
  - explainRiskAlert()
  - explainFactorShift()
- Cache explanations (1 per portfolio per day) to reduce API costs

Task 10: Explanation API
- Create api/v1/explain.ts
- POST /api/v1/explain
  - Body: {type: 'portfolio_move' | 'earnings' | 'rebalance', data: {...}}
  - Return: {text, confidence, sources, cached}

Task 11: Explanation Card Component
- Enhance client/src/components/explainer/ExplanationCard.tsx
- Display: GPT-4o explanation
- Show: confidence level, sources
- Refresh button (regenerate explanation)
- Copy to clipboard button

Task 12: PWA Setup - Service Worker
- Create client/src/service-worker.ts
- Use Workbox:
  ```javascript
  import { precacheAndRoute } from 'workbox-precaching'
  import { registerRoute } from 'workbox-routing'
  import { CacheFirst, NetworkFirst } from 'workbox-strategies'

  // Cache static assets
  precacheAndRoute(self.__WB_MANIFEST)

  // API: Network first, fallback to cache
  registerRoute(
    /\/api\/v1\/.*/,
    new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 3 })
  )

  // Quotes: Cache first (stale-while-revalidate)
  registerRoute(
    /\/api\/v1\/quotes\/.*/,
    new CacheFirst({ cacheName: 'quotes-cache' })
  )
  ```

Task 13: PWA Manifest
- Create client/public/manifest.json
  ```json
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

Task 14: PWA Icons
- Generate icons (use https://realfavicongenerator.net)
- Add to client/public/icons/
  - icon-192.png
  - icon-512.png
  - favicon.ico

Task 15: Vite PWA Plugin
- Update client/vite.config.ts
- Add vite-plugin-pwa:
  ```javascript
  import { VitePWA } from 'vite-plugin-pwa'

  export default defineConfig({
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        },
        manifest: {
          // Links to manifest.json
        }
      })
    ]
  })
  ```

VERIFICATION COMMANDS:
npm run dev
# Navigate to /earnings
# ✅ See 30-day earnings calendar
# ✅ Click stock → see historical reactions chart
# ✅ See factor-adjusted forecast

# Test explainer
curl -X POST http://localhost:3000/api/v1/explain \
  -H "Content-Type: application/json" \
  -d '{"type":"portfolio_move","data":{"symbols":["AAPL"],"todayReturn":2.3}}'
# ✅ Returns GPT-4o explanation

# Test PWA
npx lighthouse http://localhost:3000 --view
# ✅ PWA score >90
# ✅ "Add to Home Screen" prompt appears on mobile

EXIT CRITERIA:
✅ Earnings calendar shows next 30 days
✅ Historical reaction charts display correctly
✅ Factor-adjusted forecasts with confidence bands
✅ GPT-4o explanations work (<2s response)
✅ PWA installable on mobile (iOS + Android)
✅ Offline mode caches data

COMMIT STRATEGY:
- Commit after each task
- Format: "feat: add earnings calendar", "feat: integrate GPT-4o explainer", etc.
- Push to feat/earnings-ai branch

START NOW. Build that earnings intelligence! 💡
```
