# 🚀 SESSION 4: CVRF UI + BACKTESTING

**Copy-paste this entire prompt into Claude Code Terminal 4:**

---

```
SESSION 4: CVRF UI + Backtesting - Frontier Alpha Parallel Sprint

Branch: feat/cvrf-ui
Time Estimate: 6-8 hours
Conflict Risk: MEDIUM (depends on Session 3 API contracts)

MY EXCLUSIVE SCOPE:
- client/src/pages/CVRF.tsx (CVRF dashboard)
- client/src/pages/Backtest.tsx (backtest dashboard)
- client/src/components/cvrf/ (ALL CVRF UI components)
- client/src/hooks/useCVRF.ts (CVRF hooks)
- src/backtest/ (backtesting engine)
- api/v1/backtest/ (backtest API)

MY GOALS:
1. ✅ CVRF dashboard with episode timeline
2. ✅ Belief state visualization (heatmap)
3. ✅ Episode comparison UI
4. ✅ Walk-forward backtesting engine
5. ✅ Backtest results dashboard

DO NOT TOUCH (Other sessions own these):
❌ src/cvrf/ backend (Session 3 owns)
❌ src/data/ (Session 2)
❌ src/earnings/ (Session 5)

WORKAROUND:
If Session 3's API isn't ready, mock responses temporarily:
- Mock /api/v1/cvrf/episodes → return sample episodes
- Mock /api/v1/cvrf/beliefs → return sample belief state
You can replace with real API calls later.

TASKS:

Task 1: CVRF Page Setup
- Create client/src/pages/CVRF.tsx
- Layout: Sidebar (navigation), Main (episodes), Right panel (belief state)
- Add route to App.tsx: <Route path="/cvrf" element={<CVRF />} />

Task 2: Episode Timeline Component
- Create client/src/components/cvrf/EpisodeTimeline.tsx
- Horizontal timeline with episode cards
- Show: date range, return %, Sharpe, max drawdown
- Click episode → expand to show decisions
- Color code: green (positive), red (negative), gray (neutral)

Task 3: Episode Card Component
- Create client/src/components/cvrf/EpisodeCard.tsx
- Compact view: date range, return %, Sharpe
- Expanded view: all decisions, factor exposures, meta-prompt (if exists)
- Actions: "Compare with previous", "View details"

Task 4: Episode Comparison Component
- Create client/src/components/cvrf/EpisodeComparison.tsx
- Side-by-side comparison of 2 episodes
- Show: return delta, Sharpe delta, factor exposure changes
- Highlight: what changed, what worked, what didn't
- Display extracted insights and meta-prompt

Task 5: Belief State Visualization
- Create client/src/components/cvrf/BeliefStateGraph.tsx
- Line chart: belief state over time (by version)
- X-axis: time, Y-axis: factor weights
- Multiple lines for each factor (momentum, value, quality, etc.)

- Create client/src/components/cvrf/FactorWeightHeatmap.tsx
- Heatmap: X=time (episodes), Y=factors, Color=weight (-1 to +1)
- Use d3 or recharts for visualization
- Hover: tooltip with exact weight + confidence

- Create client/src/components/cvrf/RegimeTimeline.tsx
- Timeline with colored regions
- Bull (green), Bear (red), Sideways (yellow), Volatile (orange)
- Show regime transitions aligned with episodes

Task 6: Meta-Prompt Card Component
- Create client/src/components/cvrf/MetaPromptCard.tsx
- Display meta-prompt as actionable insights
- Show: optimization direction, key learnings, factor adjustments
- Buttons: "Apply to beliefs", "Save for later", "Dismiss"

Task 7: useCVRF Hook
- Enhance client/src/hooks/useCVRF.ts
- useEpisodes() → fetch episodes, handle loading/error
- useBeliefState() → fetch current belief state
- useBeliefHistory() → fetch belief history for charts
- useEpisodeComparison(episodeA, episodeB) → fetch comparison
- useApplyMetaPrompt(metaPrompt) → apply meta-prompt

Task 8: Walk-Forward Backtesting Engine
- Enhance src/backtest/WalkForwardEngine.ts
- Integrate CVRF: update beliefs after each episode
- Methods:
  - runWalkForward(symbols, startDate, endDate, episodeLength, cvrfConfig)
  - Split data into episodes (e.g., 21-day windows)
  - For each episode:
    1. Train on past data (update beliefs via CVRF)
    2. Generate portfolio using current beliefs
    3. Test on episode data (track performance)
    4. Compare with previous episode
    5. Extract insights, update beliefs
  - Return: full backtest results (equity curve, episode performance)

Task 9: Backtest Runner
- Create src/backtest/BacktestRunner.ts
- Orchestrate full backtest:
  - Load historical data (use existing HistoricalDataLoader)
  - Initialize CVRF with default beliefs
  - Run walk-forward
  - Calculate metrics (annual return, Sharpe, max DD)
  - Compare with benchmarks (S&P 500, static factors)

Task 10: Backtest API
- Create api/v1/backtest/run.ts
- POST /api/v1/backtest/run
  - Body: {symbols, startDate, endDate, episodeLength, cvrfConfig}
  - Run backtest asynchronously
  - Store results in database (optional)
  - Return: backtest ID, estimated time

- GET /api/v1/backtest/results/:id
  - Return: full backtest results

Task 11: Backtest Dashboard Page
- Create client/src/pages/Backtest.tsx
- Input form: symbols, date range, episode length, CVRF config
- Run button → POST to /api/v1/backtest/run
- Results display:
  - Equity curve (line chart)
  - Drawdown chart
  - Episode-by-episode performance table
  - Metrics comparison (CVRF vs static vs S&P 500)
  - Download results (CSV/JSON)

VERIFICATION COMMANDS:
npm run dev
# Navigate to /cvrf
# ✅ See episode timeline
# ✅ Click episode → see decisions
# ✅ Belief state heatmap shows factor evolution
# ✅ Can compare episodes side-by-side

# Run backtest
curl -X POST http://localhost:3000/api/v1/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"symbols":["AAPL","NVDA"],"startDate":"2021-01-01","endDate":"2024-01-01"}'
# Should return: backtest results

# Navigate to /backtest
# ✅ Can run backtest from UI
# ✅ See equity curve
# ✅ Episode performance table

EXIT CRITERIA:
✅ CVRF page fully functional
✅ Episode timeline displays episodes
✅ Belief state visualizations work
✅ Backtest runs successfully (3-year test)
✅ Results show CVRF alpha over static approach

COMMIT STRATEGY:
- Commit after each task
- Format: "feat: add episode timeline", "feat: add backtest dashboard", etc.
- Push to feat/cvrf-ui branch

START NOW. Make CVRF come alive! 📊
```
