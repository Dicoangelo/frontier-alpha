<!--
Frontier Alpha PR template — keep it short. Reviewers want signal, not ceremony.
-->

## Summary

<!-- 1-3 bullets. Link the user story or PRD section if there is one. -->

## Why

<!-- The "boundary" or symptom this addresses. End-user impact if relevant. -->

## Test plan

- [ ] `npx tsc --noEmit` passes (server)
- [ ] `cd client && npx tsc --noEmit` passes (client)
- [ ] `npx vitest run --reporter=basic` passes
- [ ] Manual smoke against staging or local dev where applicable

## Architecture contract

- [ ] If this PR adds/removes routes, pages, integrations, stores, hooks, API
      modules, or migrations, regenerate `schemas/arch.json` via
      `npm run arch:scan` and commit the result.
- [ ] `npm run arch:check` exits 0.

## Risk

<!-- Reversible? Behind a feature flag? Touches money/auth/data? -->
