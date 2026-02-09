# 🚀 Phase 1 Kickoff Prompt

Copy-paste this into your Claude Code terminal session to begin Phase 1:

---

## KICKOFF PROMPT (Copy below the line)

```
I'm starting Phase 1 of the Frontier Alpha upgrade project.

Context:
- Project: Frontier Alpha (AI-powered fintech platform)
- Location: ~/frontier-alpha
- Master Plan: ~/frontier-alpha/PHASE_1_MASTER_PLAN.md
- Checklist: ~/frontier-alpha/PHASE_1_CHECKLIST.md

Current Status:
- Week: 1 (Test & Data Foundation)
- Task: 1.1 (Fix E2E Test Suite)
- Blockers: None

Instructions:
1. Read PHASE_1_MASTER_PLAN.md to understand the full 30-day roadmap
2. Read PHASE_1_CHECKLIST.md to see the task breakdown
3. Start with Week 1, Task 1.1: Fix E2E Test Suite
4. Follow the plan step-by-step, checking off items in PHASE_1_CHECKLIST.md as you complete them
5. Run verification commands after each task
6. Update the session tracker in PHASE_1_MASTER_PLAN.md with session ID and progress
7. If blocked, document in PHASE_1_CHECKLIST.md and suggest solutions

Key Principles:
- Build iteratively, test frequently
- Maintain working state at each checkpoint
- Update docs as you go
- Ask questions if requirements unclear
- Focus on production-ready code, not prototypes

Begin by:
1. Reading the master plan
2. Verifying current project state (run npm test, git status)
3. Starting Task 1.1: Install MSW and fix E2E tests

Let's build a production-grade fintech platform. 🤠
```

---

## Alternative: Shorter Kickoff (if already familiar)

```
Phase 1 Frontier Alpha upgrade - Week 1, Task 1.1 (Fix E2E Tests).

Master plan: ~/frontier-alpha/PHASE_1_MASTER_PLAN.md
Checklist: ~/frontier-alpha/PHASE_1_CHECKLIST.md

Start by installing MSW and fixing the 9 failing E2E tests in tests/e2e/factors.test.ts. Follow the plan in Task 1.1.
```

---

## Resuming Mid-Phase (for later sessions)

```
Resume Phase 1 Frontier Alpha upgrade.

Read ~/frontier-alpha/PHASE_1_CHECKLIST.md to see current progress.

Current status:
- Week: [Check checklist]
- Last completed task: [Check checklist]
- Next task: [Check checklist]
- Blockers: [Check checklist]

Continue from where we left off. Verify previous task completion first, then proceed to next task in the plan.
```

---

## Quick Commands for Each Week

### Week 1: Test & Data
```bash
npm test                       # Verify tests
npm run dev                    # Test live data streaming
git push                       # Trigger CI/CD
npm run db:migrate             # Apply migrations
```

### Week 2: CVRF
```bash
npm run dev
# Navigate to /cvrf page
# Verify episode timeline appears
# Run backtest
npm run test -- cvrf
```

### Week 3: UX
```bash
npm run dev
# Navigate to /earnings page
# Test GPT-4o explanations
# Test PWA install on mobile (use ngrok for HTTPS)
npx lighthouse http://localhost:3000
```

### Week 4: Scale
```bash
# Test API key generation in settings
# Run Lighthouse
npx lighthouse http://localhost:3000 --view
# Check Sentry for errors
# Review all docs
```

---

## Session Handoff Template

When ending a session, update PHASE_1_CHECKLIST.md with:

```markdown
**Last Updated:** [Date/Time]
**Current Week:** [1|2|3|4]
**Current Task:** [Task ID]
**Blockers:** [Any issues encountered]
**Next Steps:** [What to do next session]
```

Then in next session, Claude can read this and continue seamlessly.

---

## Tips for Multi-Session Success

1. **Always read PHASE_1_CHECKLIST.md first** - Shows exactly where you left off
2. **Update checklist as you go** - Check boxes, add notes
3. **Run verification commands** - Don't assume previous session worked
4. **Git commit frequently** - Easy rollback if needed
5. **Document blockers** - Help next session (or next Claude) understand issues
6. **Take checkpoints** - At end of each task, commit with descriptive message

---

**Ready to start?** Copy the kickoff prompt above into your Claude Code session! 🚀
