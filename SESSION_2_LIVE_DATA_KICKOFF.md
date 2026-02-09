# 🚀 SESSION 2: LIVE DATA INTEGRATION

**Copy-paste this entire prompt into Claude Code Terminal 2:**

---

```
SESSION 2: Live Data Integration - Frontier Alpha Parallel Sprint

Branch: feat/live-data
Time Estimate: 4-6 hours
Conflict Risk: LOW

MY EXCLUSIVE SCOPE:
- src/data/ (all data providers)
- api/v1/quotes.ts (quote endpoint)
- client/src/api/websocket.ts (WebSocket client)
- client/src/hooks/useQuotes.ts (real-time quotes hook)
- .env (add API keys)

MY GOALS:
1. ✅ Alpaca.markets integration (or Polygon.io)
2. ✅ Real-time WebSocket quote streaming
3. ✅ Historical price fetching
4. ✅ Redis caching layer
5. ✅ Dashboard shows live-updating prices

DO NOT TOUCH (Other sessions own these):
❌ tests/ (Session 1)
❌ src/cvrf/ (Session 3)
❌ src/earnings/ (Session 5)
❌ src/middleware/ (Session 6)

TASKS:

Task 1: Provider Setup
- Create Alpaca account: https://alpaca.markets (or Polygon.io)
- Get API keys (use paper trading for free real-time data)
- Add to .env:
  ALPACA_API_KEY=your_key
  ALPACA_SECRET_KEY=your_secret
  ALPACA_BASE_URL=https://paper-api.alpaca.markets

Task 2: Alpaca Provider Implementation
- Create src/data/AlpacaProvider.ts
  - streamQuotes(symbols: string[], callback: (quote) => void)
  - getHistoricalPrices(symbol: string, from: Date, to: Date)
  - getBars(symbol: string, timeframe: '1Min' | '5Min' | '1H')
  - disconnect()
- Use @alpacahq/alpaca-trade-api npm package

Task 3: Market Data Provider Update
- Modify src/data/MarketDataProvider.ts
- Integrate AlpacaProvider
- Add connection management (reconnect on disconnect)
- Add error handling

Task 4: Redis Cache Layer
- Create src/cache/RedisCache.ts
- Cache quotes for 1 second (reduce API calls)
- Use ioredis package (already in package.json)
- Add REDIS_URL to .env (or use in-memory fallback)

Task 5: WebSocket API Route
- Modify api/v1/quotes.ts
- Add WebSocket route: /ws/quotes
- On message "subscribe": ["AAPL", "NVDA"] → stream those symbols
- On message "unsubscribe" → stop streaming
- Broadcast quote updates to all connected clients

Task 6: Client WebSocket Hook
- Create client/src/hooks/useQuotes.ts
- Connect to ws://localhost:3000/ws/quotes
- Subscribe to symbols on mount
- Update Zustand store with real-time quotes
- Handle reconnection on disconnect

Task 7: Dashboard Integration
- Modify client/src/pages/Dashboard.tsx
- Use useQuotes(['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN'])
- Display live prices with 📈/📉 indicators
- Show last update timestamp

VERIFICATION COMMANDS:
npm run dev
# Open http://localhost:3000
# Check DevTools → Network → WS
# See streaming quotes for AAPL, NVDA, etc.
# Prices should update every 1-2 seconds

# Test API directly:
wscat -c ws://localhost:3000/ws/quotes
> {"subscribe":["AAPL"]}
# Should see: {"symbol":"AAPL","price":178.32,"timestamp":"..."}

EXIT CRITERIA:
✅ WebSocket streaming active
✅ Dashboard shows live prices
✅ Reconnection works (kill connection, auto-reconnects)
✅ <100ms latency from market to dashboard

COMMIT STRATEGY:
- Commit after each task
- Format: "feat: add Alpaca provider", "feat: add WebSocket quotes", etc.
- Push to feat/live-data branch

START NOW. Get that real-time data flowing! 🚀
```
