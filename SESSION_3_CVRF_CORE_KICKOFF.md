# 🚀 SESSION 3: CVRF CORE ENGINE

**Copy-paste this entire prompt into Claude Code Terminal 3:**

---

```
SESSION 3: CVRF Core Engine - Frontier Alpha Parallel Sprint

Branch: feat/cvrf-core
Time Estimate: 6-8 hours
Conflict Risk: LOW

MY EXCLUSIVE SCOPE:
- src/cvrf/ (ALL CVRF backend logic)
- api/v1/cvrf/ (ALL CVRF API routes)
- supabase/migrations/cvrf.sql (CVRF database tables)

MY GOALS:
1. ✅ Episode tracking and storage
2. ✅ Belief state management
3. ✅ Concept extraction from episodes
4. ✅ Meta-prompt generation
5. ✅ Full CVRF backend API

DO NOT TOUCH (Other sessions own these):
❌ client/src/components/cvrf/ (Session 4 owns UI)
❌ src/backtest/ (Session 4 owns)
❌ src/data/ (Session 2)
❌ Any UI/frontend files

TASKS:

Task 1: CVRF Database Schema
- Create supabase/migrations/20260208000010_cvrf.sql
- Tables:
  - episodes (id, user_id, start_date, end_date, portfolio_return, sharpe_ratio, max_drawdown, factor_exposures JSONB, created_at)
  - decisions (id, episode_id, timestamp, symbol, action, weight_before, weight_after, reason, factors JSONB, sentiment JSONB, confidence, created_at)
  - belief_states (id, user_id, version, factor_weights JSONB, risk_tolerance, momentum_horizon, concentration_limit, current_regime, regime_confidence, conceptual_priors JSONB, updated_at)
  - conceptual_insights (id, episode_id, type, concept TEXT, evidence JSONB, confidence, impact_direction, created_at)
  - meta_prompts (id, episode_id, optimization_direction TEXT, key_learnings JSONB, factor_adjustments JSONB, risk_guidance TEXT, timing_insights TEXT, generated_at)

- Indexes:
  - CREATE INDEX idx_episodes_user_date ON episodes(user_id, start_date DESC);
  - CREATE INDEX idx_decisions_episode ON decisions(episode_id, timestamp DESC);
  - CREATE INDEX idx_beliefs_user_version ON belief_states(user_id, version DESC);

Task 2: Episode Manager
- Enhance src/cvrf/EpisodeManager.ts
- Methods:
  - createEpisode(startDate, endDate, userId): Promise<Episode>
  - getEpisodes(userId, limit, offset): Promise<Episode[]>
  - getEpisodeById(id): Promise<Episode>
  - addDecision(episodeId, decision): Promise<Decision>
  - finalizeEpisode(episodeId, metrics): Promise<Episode>
  - compareEpisodes(episodeA, episodeB): Promise<EpisodeComparison>

Task 3: Belief Updater
- Enhance src/cvrf/BeliefUpdater.ts
- Methods:
  - getCurrentBelief(userId): Promise<BeliefState>
  - updateBelief(userId, updates, learningRate): Promise<BeliefState>
  - applyMetaPrompt(userId, metaPrompt): Promise<BeliefUpdate[]>
  - trackBeliefHistory(userId): Promise<BeliefState[]>

Task 4: Concept Extractor
- Enhance src/cvrf/ConceptExtractor.ts
- Methods:
  - extractInsights(betterEpisode, worseEpisode): Promise<ConceptualInsight[]>
  - identifyProfitablePatterns(decisions): Promise<string[]>
  - analyzeFactorShifts(episodeA, episodeB): Promise<Map<string, number>>
  - calculateDecisionOverlap(episodeA, episodeB): number

Task 5: Meta-Prompt Generator
- Create src/cvrf/MetaPromptGenerator.ts
- Methods:
  - generateMetaPrompt(insights): MetaPrompt
  - generateOptimizationDirection(insights): string
  - extractKeyLearnings(insights): string[]
  - calculateFactorAdjustments(insights): Map<string, number>
  - generateRiskGuidance(insights): string
  - generateTimingInsights(insights): string

Task 6: CVRF Manager Integration
- Enhance src/cvrf/CVRFManager.ts
- Full cycle:
  - startEpisode() → creates episode, records current belief
  - recordDecision() → logs decision in episode
  - endEpisode() → calculates performance, runs comparison with previous
  - runCVRFCycle() → extract insights, generate meta-prompt, update beliefs

Task 7: API Routes
- Create api/v1/cvrf/episodes.ts
  - GET /api/v1/cvrf/episodes (list episodes)
  - POST /api/v1/cvrf/episodes (create episode)
  - GET /api/v1/cvrf/episodes/:id (get episode details)
  - POST /api/v1/cvrf/episodes/:id/finalize (finalize episode)

- Create api/v1/cvrf/beliefs.ts
  - GET /api/v1/cvrf/beliefs (get current belief state)
  - POST /api/v1/cvrf/beliefs/update (update belief state)
  - GET /api/v1/cvrf/beliefs/history (get belief history)

- Create api/v1/cvrf/decisions.ts
  - POST /api/v1/cvrf/decisions (record decision)
  - GET /api/v1/cvrf/decisions/:episodeId (get episode decisions)

- Create api/v1/cvrf/meta-prompt.ts
  - POST /api/v1/cvrf/meta-prompt/generate (generate meta-prompt from episode comparison)
  - POST /api/v1/cvrf/meta-prompt/apply (apply meta-prompt to beliefs)

VERIFICATION COMMANDS:
npm run db:migrate  # Create CVRF tables

# Test episode creation
curl -X POST http://localhost:3000/api/v1/cvrf/episodes \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2024-01-01","endDate":"2024-01-31"}'
# Should return: {"id":"...","startDate":"...","endDate":"..."}

# Test episode list
curl http://localhost:3000/api/v1/cvrf/episodes
# Should return: [{"id":"...","startDate":"..."}]

# Test belief state
curl http://localhost:3000/api/v1/cvrf/beliefs
# Should return: current belief state

EXIT CRITERIA:
✅ All CVRF tables created in Supabase
✅ All API routes return valid responses
✅ Can create episode, add decisions, finalize episode
✅ Belief state updates via meta-prompt
✅ Concept extraction works on episode comparison

COMMIT STRATEGY:
- Commit after each task
- Format: "feat: add episode manager", "feat: add CVRF API routes", etc.
- Push to feat/cvrf-core branch

START NOW. Build that cognitive engine! 🧠
```
