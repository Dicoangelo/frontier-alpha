# Frontier Alpha Graveyard

| File | Original Path | What it provided | Why archived |
|------|--------------|------------------|--------------|
| prd-ux-optimization.json | tasks/prd-ux-optimization.json | UX optimization round 1 — 9 stories, all marked done | Completed and superseded by prd-ux-optimization-r2.json |
| prd-v2-completion.json | tasks/prd-v2-completion.json | V2 completion — 16 stories, all marked done | Completed and superseded by prd-v2-world-class.json |
| broker/ | src/broker/ | Original broker adapter layer (BrokerAdapter.ts + AlpacaAdapter.ts, 688 lines) | Superseded by src/trading/ which has 2x the features (1381 lines). Zero imports across codebase |
| NotificationSettings-settings.tsx | client/src/components/settings/NotificationSettings.tsx | Email-based alert settings (335 lines) | Duplicate — only components/notifications/NotificationSettings.tsx is imported. Settings version is dead code |
