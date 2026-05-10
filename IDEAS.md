# Frontier Alpha — Ideas & Cross-Pollination Backlog

Living doc. Captures borrowable patterns from across the D-ecosystem and from
external research that could land in Frontier Alpha. Not a roadmap (see
`ROADMAP.md` for what's actively queued). This is the "what ELSE could we do"
file — review periodically, promote ideas to ROADMAP when their moment hits.

**Convention:** every idea has a one-line headline, a 2-3 sentence "why it
matters," a "lift estimate" (XS / S / M / L), and a source citation.

---

## From Cinema Studio (OS-App video gen substrate)

Source: `~/projects/apps/OS-App/services/cinema/` (~2.3k LOC, TS-clean,
unwired). Memory: `project_cinema_studio.md`, `project_cinema_substrate_pivot.md`.

### IDEA-CIN-1 — Substrate-first routing for the AI explainer

Replace the current DeepSeek → OpenAI → template **failover** chain with an
explicit **substrate + escapes** model. Pick one substrate (DeepSeek), define
the hard-constraint escape conditions (tool-use required, token > 8K, latency
budget), make every escape a documented decision instead of a try/catch
fallback. Pattern transferred verbatim from `services/cinema/router.ts`.

- **Why it matters:** Failover hides cost behavior; substrate-first makes
  cost predictable and escape-rate observable. Forces the question "is this
  ALWAYS more expensive?" for every escape.
- **Lift:** S (rename + restructure existing logic, no new providers)
- **Risk:** Low — current behavior preserved, just better-named
- **Promote when:** AI cost becomes a real line item OR we want to start
  publishing per-feature cost dashboards

### IDEA-CIN-2 — Provenance ledger for Cognitive Insights

Cinema persists every render's prompt, refs, decision, attempts, cost,
result to IndexedDB and surfaces it as a Render Queue. Same structure could
ledger every Cognitive Insight generated for a user: `frontier_insight_ledger`
table with `(user_id, generated_at, prompt_hash, factors_snapshot, model,
output, cost_cents, latency_ms, user_rating)`. UI surface: "Insight history"
page where a user can replay/dispute past explanations.

- **Why it matters:** Closes the trust gap. Insight comes with a provenance
  receipt, not just a paragraph. Also: training signal for future fine-tunes
  if you decide that's a moat.
- **Lift:** M (1 migration + 1 service + 1 UI page)
- **Risk:** Storage cost grows linearly with users; can be capped via
  retention policy
- **Promote when:** First user asks "why did the AI say that?" OR before
  any "explainability" pitch

### IDEA-CIN-3 — Multi-anchor temporal factor analysis

Cinema realized single-image i2v drifts; multi-anchor (HERO_14 pose pack)
breaks the drift window. Analogue: factor analysis based on a single
snapshot drifts in interpretation. Feed Cognitive Insight multiple temporal
anchors — current, 5d prior, 30d prior, regime classification at each — so
the LLM has temporal grounding instead of inventing it. v1.3.4's server-side
history endpoint is half of this; the other half is regime-tagged history.

- **Why it matters:** "Your momentum exposure rose 5%" reads differently
  with vs without "...continuing the regime shift that started 18d ago."
- **Lift:** M (extend `useFactorsHistory` to multi-window, prompt rework)
- **Risk:** Token cost grows ~3x for the explainer call; mitigated by
  IDEA-CIN-1's substrate routing
- **Promote when:** Cognitive Insight gets its next user-feedback loop

### IDEA-CIN-4 — Quality-window awareness for live signals

Cinema knows Kling has 0-3s + 7-10s "golden windows" with 3-7s drift.
Analogue: factor signals have time-of-day reliability. First 30 / last 30
of market open are noisy; midday is clean. Factor cards could surface a
confidence pill that adjusts by capture time, OR actively defer rendering
until the next clean window for non-time-critical insights.

- **Why it matters:** Surfaces what every quant trader already knows but
  no consumer-fintech UI ever shows: data quality varies by clock.
- **Lift:** S (one timestamp comparison, one badge component)
- **Risk:** None
- **Promote when:** Factor card UX gets its next polish round

### IDEA-CIN-5 — Validation-rejection-is-free error classification

Cinema knows failed Seedance rejections cost $0 (`x-fal-billable-units: 0`).
Frontier Alpha analogue: classify upstream errors by whether they consumed
quota. A rate-limited Polygon call DID consume quota; a malformed query did
not. Different retry/backoff strategies should follow.

- **Why it matters:** The v1.3.7 cache-thrashing investigation could have
  been faster if we'd had a "did this burn quota or not" signal in logs.
- **Lift:** XS (parse a few response headers in the data provider layer)
- **Risk:** None
- **Promote when:** Polygon Starter is live and we start measuring quota
  consumption properly

---

## From FriendlyFace (forensic evidence platform)

Source: `~/projects/FriendlyFace` — Python FastAPI backend, React 19 frontend,
6-layer architecture (Recognition → Federated Learning → Blockchain Forensic
→ Fairness → Explainability → Consent). 1,546 tests passing, 84+ endpoints.
Memory: `project_friendlyface_*.md`.

FriendlyFace's whole product is "ForensicSeal" — cryptographically signed
W3C Verifiable Credentials proving AI compliance. Every operation produces
hash-chained, Merkle-tree-rooted, DAG-tracked evidence. The transferable
patterns are not domain-locked to facial recognition; they're general
"trust the AI's output" infrastructure that maps cleanly onto financial
factor analysis.

### IDEA-FF-1 — CVRF episodic belief hash-chaining (high impact)

`friendlyface/core/models.py::ForensicEvent` is an immutable event with
SHA-256 hashed to the previous event's hash, sequence number, and `seal()`
+ `verify()` methods. Pattern from Mohammed ICDF2C 2024.

Frontier Alpha's CVRF (`src/cvrf/`) is "episodic learning with belief
persistence" — but the episodes are NOT cryptographically chained today.
Adopt ForensicEvent: every belief update (factor weight change, regime
classification, episode close) becomes a hash-chained event. Anyone can
verify "yes, on 2026-05-08 the model believed X" with an inclusion proof.

- **Why it matters:** Massive credibility lift for institutional / fund-mgr
  audiences. "Show me your audit trail" becomes a one-click answer instead
  of "trust the database." Differentiator vs every retail-grade competitor.
- **Lift:** M (one Pydantic-equivalent event model + chain insertion in
  `BeliefUpdater` + verify endpoint). Reuses existing CVRF persistence.
- **Source citations:** `friendlyface/core/models.py:84-130` (ForensicEvent),
  `friendlyface/core/merkle.py` (BioZero arXiv:2409.17509)
- **Promote when:** First institutional pitch, OR when a SOC 2 conversation
  starts

### IDEA-FF-2 — Multi-method factor explainability (high impact)

FriendlyFace runs **three** explanation methods per prediction:
- LIME (Ribeiro 2016, KDD) at `explainability/lime_explain.py`
- SHAP (Lundberg & Lee 2017, NeurIPS) at `explainability/shap_explain.py`
- SDD saliency (Li 2025, arXiv:2505.03837) at `explainability/sdd_explain.py`

Each is a separate module producing its own ForensicEvent. Users can compare
explanations side-by-side, which catches LLM hallucination and exposes
disagreement between methods.

Frontier Alpha's Cognitive Insight is currently a single GPT-4o template
path. Adding SHAP for factor contribution + LIME for local interpretability
around a specific position + a domain-specific saliency analog ("which
trading days mattered most for this momentum signal") would be a serious
differentiation vs every "AI explains your portfolio" incumbent.

- **Why it matters:** SHAP factor decomposition is table-stakes in
  institutional quant; consumer-fintech doesn't have it. Showing all three
  methods agree is a much stronger trust signal than one paragraph of LLM.
- **Lift:** L (one new module per method, prompt rework, UI for side-by-side)
- **Promote when:** Cognitive Insight gets its next major polish round, OR
  when v2 of the product targets the institutional / fund-of-funds tier
- **Note:** SHAP for factors is well-trod ground. The novel angle is the
  multi-method consensus check + ForensicEvent provenance.

### IDEA-FF-3 — Provenance DAG for portfolio decisions

`friendlyface/core/models.py::ProvenanceNode` is a DAG node with `parents`
+ `relations` (PROV-O W3C-style). FriendlyFace chains:
`training → model → inference → explanation → bundle`.

Frontier Alpha analogue:
`market_data → factor_compute → optimizer → recommendation → user_action`.

Every Cognitive Insight or trade suggestion becomes a node. User asks "why
this trade?" and gets the full ancestry chain. ProvenanceNode lookup is
O(parent_count) per hop, indexed via `parents` field.

- **Why it matters:** "How did the AI decide?" turns from a black box into
  a literal graph traversal. Combines naturally with IDEA-CIN-2 (the cinema
  provenance ledger) — same primitive, same backing table.
- **Lift:** M (one table, one service, one explorer UI)
- **Promote when:** Cinema provenance ledger work starts (do them together)

### IDEA-FF-4 — ForensicSeal for backtest / compliance receipts

`friendlyface/seal/service.py` issues W3C Verifiable Credentials + Schnorr
ZK proof + Merkle root anchoring + Ed25519 DID signature. The "SSL
certificate for AI" framing.

Frontier Alpha analogue: a backtest result OR a quarterly performance
report becomes a signed credential proving WHEN it was run, on WHAT data
snapshot, with WHAT model version. Verifiable by any third party without
trusting Frontier Alpha's database. Embeds nicely in PDFs, emails, web
pages.

- **Why it matters:** "Backtested CAGR 18.3%" claims are worthless without
  a credential. Producing one is a 30-line endpoint that generates a
  badge URL like `friendlyface.../verify/seal-id`.
- **Lift:** M (Ed25519 keypair management, VC schema, verification page)
- **Promote when:** Marketing claims about historical performance need to
  be defensible (or when an institutional buyer asks for proof)

### IDEA-FF-5 — Append-only audit log for trades

Every Alpaca paper / live trade becomes a ForensicEvent. Append-only,
hash-chained, Merkle-rooted. User has tamper-evident copy of their order
book independent of the broker's system.

- **Why it matters:** Compliance + dispute resolution. "Alpaca says X, our
  log says Y" — the chain proves which timestamp came first.
- **Lift:** S (one hook in `BrokerAdapter`, reuse the IDEA-FF-1 chain)
- **Promote when:** First user reports an Alpaca discrepancy, OR before
  any "regulated paper trading" pitch

### IDEA-FF-6 — Demo mode via `?demo=true` URL param

FriendlyFace's `App.tsx::RequireAuth` checks for `?demo=true` and bypasses
auth, with `demoFetch` in `services/apiClient.ts` returning demo data.
20 pages use it.

Frontier Alpha already has SOME demo state (per memory v1.2.6 fix) but no
URL-param-based bypass. Adopting this would simplify "share a demo link"
flows without account creation.

- **Lift:** S
- **Promote when:** Marketing / sales asks for a one-click demo URL

### What NOT to borrow from FriendlyFace

- **DID Management / decentralized identifiers as primary product** —
  financial customers don't ask for them, regulators don't require them
- **ZK proofs over compliance data** — overkill until we're targeting
  regulated funds with confidentiality constraints
- **Federated Learning** — only relevant if Frontier Alpha trains on
  customer-specific data (we don't, models are trained centrally)
- **EU AI Act compliance UIs / Conformity Reports** — adjacent regulatory
  frame; financial side cares about FINRA/SEC, different surface
- **Bias audits as a primary feature** — useful internally, not a customer
  product on this side

---

## From ResearchGravity / arxiv (deferred, suggested)

Source: ResearchGravity protocol. Last sweep: pre-2026-04. The FriendlyFace
analysis above pulled three real arxiv papers it has implemented in code:

- **arXiv:2409.17509 (BioZero, 2024)** — append-only Merkle tree for
  forensic evidence integrity. Already in FriendlyFace. Direct analog:
  factor signal integrity verification, CVRF episode chain.
- **Mohammed ICDF2C 2024** — forensic-friendly schema (ForensicEvent,
  ProvenanceNode, ForensicBundle). Already in FriendlyFace. Note: Mohammed
  is in cross-project memory `project_mohammed_contact.md` — direct
  collaboration channel exists if a deeper port is pursued.
- **arXiv:2505.03837 (SDD Saliency, Li 2025)** — pixel-level saliency via
  spatial-directional decomposition. Already implemented in FriendlyFace.
  Could analog to "trading-day saliency" for momentum / volatility signals
  (which days drove the exposure?).

### Suggested re-sweep queries

When ResearchGravity is rerun for Frontier-Alpha-relevant papers, focus on:

1. **"factor exposure interpretability transformer 2025-2026"** — likely
   has new attention-based factor models that improve on classical OLS
   regression for factor-loading estimation
2. **"episodic belief learning portfolio 2025-2026"** — direct hit on CVRF;
   anything new in episodic memory for trading agents
3. **"regime detection deep learning end-of-day 2025-2026"** — CVRF's
   regime layer could pull new techniques
4. **"options pricing neural surrogate 2025-2026"** — feeds the Options
   page's vol surface
5. **"factor saliency explainability finance 2025-2026"** — extends the
   IDEA-FF-2 multi-method explainer with domain-specific saliency

### How to run

```bash
# In a separate session for context isolation:
/deep-research factor exposure interpretability transformer 2025-2026
# OR for batch mode:
python3 ~/projects/researchgravity/...  # exact entry point per RG docs
```

Output: a `_TBD` section here gets replaced with paper citations + lift
estimates per finding. Aim for 5-8 papers per sweep, not exhaustive.

---

## Promotion process

When an idea looks ready to ship:
1. Move from this file into `ROADMAP.md` "Next session candidates" with
   estimated lift and explicit acceptance criteria
2. Strike through here with a pointer to the ROADMAP entry / commit SHA
3. Keep the original idea in this file as historical record (don't delete)

When an idea looks dead:
1. Add a `~~strikethrough~~` and a one-line `**Killed:**` reason
2. Move to a "Considered and rejected" section at the bottom (TBD when needed)

---

## Source-tracking

Every idea cites:
- Source project + path
- Memory reference (if applicable)
- Related FA component(s) it would touch

This makes it auditable months later when you're wondering "wait, where did
the idea for X come from?"
