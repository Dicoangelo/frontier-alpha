# 🚀 SESSION 1: FOUNDATION (Tests + CI/CD)

**Copy-paste this entire prompt into the AI agent Terminal 1:**

---

```
SESSION 1: Foundation (Tests + CI/CD) - Frontier Alpha Parallel Sprint

Branch: feat/foundation
Time Estimate: 4-6 hours
Conflict Risk: LOW

MY EXCLUSIVE SCOPE:
- tests/ (all test files)
- .github/workflows/ (CI/CD)
- vitest.config.ts (test config)
- supabase/migrations/ (base tables only)
- scripts/migrate.ts (migration runner)

MY GOALS:
1. ✅ Fix all 376 tests (currently 9 failing E2E tests)
2. ✅ Test coverage >80% on core modules
3. ✅ GitHub Actions CI/CD pipeline
4. ✅ Database migrations for base schema

DO NOT TOUCH (Other sessions own these):
❌ src/data/ (Session 2)
❌ src/cvrf/ (Session 3)
❌ src/backtest/ (Session 4)
❌ client/src/components/cvrf/ (Session 4)
❌ src/earnings/ (Session 5)
❌ src/middleware/ (Session 6)

TASKS:

Task 1: Install MSW (Mock Service Worker)
- npm install --save-dev msw@latest
- Create tests/setup/msw.ts with handlers
- Create tests/fixtures/market-data.ts with realistic test data

Task 2: Fix E2E Tests
- Fix tests/e2e/factors.test.ts (9 failing tests - fetch errors)
- Mock API responses with MSW
- Ensure test isolation (each test has clean state)

Task 3: Test Coverage
- Update vitest.config.ts with coverage config
- Run npm run test:coverage
- Target >80% on src/factors/, src/optimizer/, src/core/

Task 4: CI/CD Pipeline
- Create .github/workflows/ci.yml (run tests on push)
- Create .github/workflows/deploy.yml (deploy to Vercel on main merge)
- Add test badge to README

Task 5: Database Migrations
- Create supabase/migrations/20260208000001_init.sql
  - users table (if not exists)
  - portfolios table (basic schema)
  - symbols table
  - holdings table
- Create scripts/migrate.ts for migration runner
- Add npm script: "db:migrate": "tsx scripts/migrate.ts"

VERIFICATION COMMANDS:
npm test                       # Must show: 376 passed, 0 failed
npm run test:coverage          # Must show: >80% coverage
git push                       # Must trigger: GitHub Actions (green checkmark)
npm run db:migrate             # Must create: base tables in Supabase

EXIT CRITERIA:
✅ All tests passing
✅ Coverage >80%
✅ CI/CD pipeline active (check GitHub Actions tab)
✅ Base database tables exist

COMMIT STRATEGY:
- Commit after each task completion
- Format: "test: fix E2E factors tests", "ci: add GitHub Actions", etc.
- Push to feat/foundation branch frequently

START NOW. Work systematically through tasks 1-5. I'll see you at the merge! 🤠
```
