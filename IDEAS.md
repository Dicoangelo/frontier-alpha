# Frontier Alpha — Ideas & Cross-Pollination Backlog

Living doc. Captures borrowable patterns from across the D-ecosystem and from
external research that could land in Frontier Alpha. Not a roadmap (see
`ROADMAP.md` for what's actively queued). This is the "what ELSE could we do"
file — review periodically, promote ideas to ROADMAP when their moment hits.

**Convention:** every idea has a one-line headline, a 2-3 sentence "why it
matters," a "lift estimate" (XS / S / M / L), and a source citation.

---

## ⏸️ Status: deferred until current app is production-ready

**Decision (2026-05-10):** Hold all ideas in this file. Ship the existing
v1.3.7 surface to production-grade FIRST. Re-open this doc only when the
current product is mature.

### Production-readiness gate (must all be met before promoting any idea)

- [ ] Polygon Starter ($29/mo) live — unblocks the residual data freshness
      issues per `ROADMAP.md`
- [ ] FactorDeltas card showing real day-1 deltas in production (the
      v1.3.4 endpoint working end-to-end for the seeded test user)
- [ ] Onboarding empty states polished across all primary pages (one
      pass per page, audit done)
- [ ] Visual regression CI green for 14+ consecutive nightly runs (no
      false positives, no real regressions)
- [ ] At least one external user (beyond Dico) actively using the app
      and giving feedback
- [ ] Test coverage: server 800+ passing, client 220+ passing
- [ ] Lighthouse / Core Web Vitals: green across all primary routes

When all 7 gates are met → return here, re-rank ideas against the current
state of the product, promote 1-2 highest-value to `ROADMAP.md` "Next
session candidates", begin work.

Until then: **do not start any IDEA-* work.** Polish what's shipped.

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

### IDEA-CIN-4 — Quality-window awareness for live signals ✅ SHIPPED v1.6.0

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

### IDEA-CIN-5 — Validation-rejection-is-free error classification ✅ SHIPPED v1.6.0

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

### IDEA-FF-1 — CVRF episodic belief hash-chaining (high impact) ✅ SHIPPED v1.6.0

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

### IDEA-FF-2 — Multi-method factor explainability (high impact) ✅ v1 SHIPPED v1.9.0 (3-method consensus; LIME/SHAP models still open)

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

### IDEA-FF-3 — Provenance DAG for portfolio decisions ✅ SHIPPED v1.7.0

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

### IDEA-FF-4 — ForensicSeal for backtest / compliance receipts ✅ v1 SHIPPED v1.9.0 (Ed25519 receipts; VC/Merkle anchoring still open)

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

### IDEA-FF-5 — Append-only audit log for trades ✅ SHIPPED v1.6.0

Every Alpaca paper / live trade becomes a ForensicEvent. Append-only,
hash-chained, Merkle-rooted. User has tamper-evident copy of their order
book independent of the broker's system.

- **Why it matters:** Compliance + dispute resolution. "Alpaca says X, our
  log says Y" — the chain proves which timestamp came first.
- **Lift:** S (one hook in `BrokerAdapter`, reuse the IDEA-FF-1 chain)
- **Promote when:** First user reports an Alpaca discrepancy, OR before
  any "regulated paper trading" pitch

### IDEA-FF-6 — Demo mode via `?demo=true` URL param ✅ SHIPPED v1.7.0

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

## From ResearchGravity arxiv sweep (2026-05-09 R&D Discovery session)

Session: `frontier-alpha-r&d-d-20260509-213842-b881f0` (archived). 25+
papers surfaced across 5 query topics. Headliners + lift estimates below.
Synthesis (thesis-gap-direction) at the end of this section.

### Topic A — Interpretable attention factor models

- **arXiv:2510.11616 — "Attention Factors for Statistical Arbitrage"** (Oct 2025)
  - Sharpe 4.0 frictionless, **2.3 with friction** on 24-yr daily returns
    of top-500 US equities. Loadings are interpretable (closely tied to
    industry sectors).
  - **FA fit:** Direct augment to `src/factors/FactorEngine.ts`. Replace
    or augment classical OLS factor regression with attention-derived
    loadings. Keep classical as baseline for fallback + comparison.
  - **Lift:** L (3-week phase) — port the attention factor model + run
    it parallel to OLS in production for dual-output validation
- **arXiv:2505.01575 — "Asset Pricing in Transformer"** (May 2025) — anatomy
  of black-box transformer factor models, mechanistic interpretation. Pair
  with above for the "why does the attention model say what it says" UI.
- **arXiv:2511.21514 — "Mechanistic Interpretability for Transformer-based
  Time Series Classification"** (Nov 2025) — activation patching, attention
  saliency, sparse autoencoders for individual head causal roles. Pulls
  directly into Cognitive Insight v3.
- **arXiv:2507.07107 — "ML-Enhanced Multi-Factor Quantitative Trading"** —
  cross-sectional portfolio optimization with bias correction.

### Topic B — Episodic memory for trading agents (CVRF v2 candidates)

- **arXiv:2601.03192 — "MemRL: Self-Evolving Agents via Runtime RL on
  Episodic Memory"** (Jan 2026)
  - Non-parametric, **decouples stable reasoning from plastic memory**.
    Two-Phase Retrieval filters noise to identify high-utility strategies
    via environmental feedback.
  - **FA fit:** Maps directly to CVRF — `factor model = stable reasoning`,
    `belief state = plastic memory`. The Two-Phase Retrieval pattern is
    what CVRF needs to graduate from "log episodes" to "learn from
    episodes." This is the highest-leverage paper in the sweep.
  - **Lift:** L (4-6 week phase) — touches `src/cvrf/`, requires RL
    training infrastructure
- **arXiv:2603.07670 — "AgeMem: Memory for Autonomous LLM Agents"** —
  treats 5 memory ops (store/retrieve/update/summarize/discard) as
  callable tools, end-to-end RL with 3-stage curriculum (SFT warm-up,
  task-level RL, step-level GRPO). Cleaner abstraction than current CVRF.
- **arXiv:2503.04143 — "MTS: Deep RL Portfolio Management with
  Time-Awareness + Short-Selling"** — domain-specific baseline.
- **arXiv:2512.13564 — "Memory in the Age of AI Agents"** — taxonomy
  paper: factual / experiential / working memory. Frame for
  positioning CVRF.

### Topic C — Deep regime detection

- **arXiv:2410.22346 — "Representation Learning for Regime Detection in
  Block Hierarchical Financial Markets"** (Oct 2024)
  - SPDNet/SPD-NetBN/U-SPDNet on Riemannian manifold of block-hierarchical
    SPD correlation matrices. Direct upgrade over HMM/Markov-switching.
  - **FA fit:** CVRF's regime layer currently uses simple heuristics.
    Swap in SPDNet for the correlation-matrix-based classifier.
  - **Lift:** M (existing CVRF regime hooks + new model + new training)
- **arXiv:2508.19609 — "FinCast: Foundation Model for Financial
  Time-Series Forecasting"** — handles non-stationarity, multi-domain,
  varying temporal resolutions. Worth tracking for v3.
- **arXiv:2603.01820 — "Deep Learning for Financial Time Series:
  Large-Scale Benchmark"** (Mar 2026) — benchmarks linear / RNN /
  transformer / state-space / sequence-rep across 2010-2025. Read before
  picking any architecture.
- **arXiv:2603.17692 — "BlindTrade"** (ICLR 2026 Workshop) —
  anonymization-first LLM-GNN-RL for cross-market regime generalization.

### Topic D — Temporal saliency for financial signals ✅ v1 SHIPPED v1.8.0 (analytic decomposition; CrossScaleNet model still open)

- **arXiv:2509.22839 — "CrossScaleNet: Learning Temporal Saliency for
  Time Series Forecasting with Cross-Scale Attention"** (Sep 2025)
  - Patch-based cross-attention with multi-scale processing. Intrinsic
    explainability via embedded attention.
  - **FA fit:** Direct UX upgrade. Power the "your momentum signal was
    driven 73% by the last 14 days" copy on Cognitive Insight cards.
    Time-series analog of FriendlyFace's SDD saliency (arXiv:2505.03837).
  - **Lift:** S-M (1-2 week phase, mostly UI + one new model surface)
- **arXiv:2505.13100 — "Time Series Saliency Maps: Cross-domain Integrated
  Gradients"** — generalization of IG to ANY domain expressible as
  invertible differentiable transform of time domain (Fourier, wavelet).
  Useful when raw-time saliency is noisy.
- **arXiv:2407.15909 — "Survey of XAI in Financial Time Series
  Forecasting"** — read first to pick the right method; categorizes
  approaches.

### Topic E — Provenance + verifiable audit (FF-1 / FF-4 substrate)

- **arXiv:2511.17118 — "Constant-Size Cryptographic Evidence Structures
  for Regulated AI Workflows"** (Nov 2025)
  - Hash-and-sign construction with collision-resistant hashes + digital
    signatures. **Constant-size storage with uniform verification cost
    per event** — the exact properties IDEA-FF-1 needs at scale.
  - **FA fit:** Replace the "Mohammed ICDF2C 2024 forensic event chain"
    target in IDEA-FF-1 with this. Same goal, better cost profile.
  - **Lift:** M-L (Ed25519 keypair management + signed event store +
    verification endpoint). Wrap into the same delivery as IDEA-FF-1.
- **arXiv:2503.22573 — "Framework for End-to-End Verifiable AI
  Pipelines"** — DECORAIT decentralized tamper-evident registry, ZK
  proofs for training correctness / data provenance / inference
  execution. Matches IDEA-FF-4 (signed backtest receipts).
- **arXiv:2502.19567 — "Atlas: ML Lifecycle Provenance & Transparency"**
  — extends Sigstore's Rekor with C2PA model transformation
  attestations. Lower-lift adoption path if we want OFF-the-shelf vs
  build-our-own.
- **arXiv:2602.20214 — "Right to History: Sovereignty Kernel for
  Verifiable AI Agent Execution"** (Feb 2026) — RFC 6962 Merkle audit
  logs + capability-based isolation + energy-budget governance.
  Strategic frame, less tactical fit.
- **arXiv:2511.02841 — "AI Agents with DIDs + Verifiable Credentials"**
  — pairs with IDEA-FF-4. Skip unless we go deep on the institutional
  trust play.

### Synthesis (per RG protocol — Thesis · Gap · Innovation Direction)

**Thesis** — 2024-2026 quant finance ML is converging on three pillars:
(1) transformer/attention models WITH interpretable structure, (2)
episodic memory architectures that decouple stable reasoning from
plastic memory, (3) tamper-evident provenance audit trails. Temporal
saliency is mature tech ready to plug in. The black-box-beats-Fama-French
era is ending; the new bar is "interpretable deep model that beats AND
explains."

**Gap** — No paper combines all four pillars (interpretable attention
factors + episodic memory + temporal saliency + provenance audit) into
one production system. Each pillar exists in isolation. Surveys cover
financial time-series XAI but skip the specific "explain my factor
exposure for a retail / advisor user" UX. CVRF (FA's cognitive value
reasoning framework with episodic learning + factor weights) is unique
to FA in the literature — closest analog (MemRL) is not factor-aware.
No published implementation of constant-size cryptographic evidence
(arXiv:2511.17118) for financial recommendation systems — this is the
cleanest IP/moat opportunity.

**Innovation Direction** — actionable phased roadmap for FA:

| Phase | Lift | Headliner paper | Description |
|---|---|---|---|
| 1 | 2-3 wks | arXiv:2510.11616 | Integrate Attention Factors into FactorEngine as v2 augment. Classical OLS stays baseline. |
| 2 | 4-6 wks | arXiv:2601.03192 | Adopt MemRL stable/plastic decoupling for CVRF. Two-Phase Retrieval. Episodes become RL training signal. |
| 3 | 1-2 wks | arXiv:2509.22839 | Add CrossScaleNet temporal saliency to Cognitive Insight. UX upgrade. |
| 4 | 3-4 wks | arXiv:2511.17118 | Constant-size cryptographic evidence for every Insight + backtest. Unifies IDEA-FF-1 + IDEA-FF-4. |

**Bonus moat:** The combined system (attention factors + episodic CVRF
+ temporal saliency + verifiable audit) doesn't exist anywhere in the
literature. Workshop paper writeup candidate for ICLR FinAI 2027 or
similar — would establish FA as the production reference implementation
before competitors integrate the pieces.

### How to re-run this sweep

```bash
cd ~/projects/apps/researchgravity
python3 scripts/session/init_session.py "FA R&D Discovery $(date +%Y-%m-%d)" --impl-project frontier-alpha
# Then either:
#   - delegate_research MCP for each query topic (current state: routes
#     to no-op `get_session_stats` agents; needs an arxiv-fetcher agent
#     to be registered in the trust ledger)
#   - WebSearch with allowed_domains=["arxiv.org"] (what worked today)
#   - Run python3 -m cpb.precision_cli "query" --deep-research
# Then log_finding for each paper, archive_session.py to finalize.
```

Cadence: monthly with a 5-paper-per-query budget. Today's sweep was the
first since pre-2026-04; the four-pillar thesis above is fresh and
should be revisited Q3 2026 to check for convergence-system papers
(competitors building toward the same gap).

---

## Convergence + cross-project learning (architectural note)

The cinema and FriendlyFace borrows above are not isolated borrowings — they
are evidence that the D-ecosystem's projects can serve as a **convergence
substrate** for each other. Three observations:

1. **Substrate-first routing was solved in cinema first, then mapped to FA.**
   The pattern wasn't invented in either project; it was crystallized in
   cinema (because video-gen has stark cost gradients between providers) and
   transferred here. The lesson: small, sharp project domains crystallize
   patterns earlier than large projects can.

2. **FriendlyFace already implements three published papers** — Mohammed
   ICDF2C 2024 (forensic event chain), BioZero arXiv:2409.17509 (Merkle
   tree), Li 2025 arXiv:2505.03837 (SDD saliency). The work of porting them
   to FA is _adoption_, not _invention_. Meta-vengine's premise (D-ecosystem
   learns from all projects) is exactly this adoption-loop made automatic.

3. **ResearchGravity is the supply side of the same loop.** RG fetches new
   arxiv, FF/cinema/OS-App implement it first in a focused domain, FA adopts
   the proven version. This is a 3-stage pipeline: research → focused
   prototype → cross-project adoption. The bottleneck today is manual
   coordination between stages.

### Architectural opportunity

If meta-vengine periodically scans every `~/projects/*/CONTEXT.md` + emits
"X has primitive Y at file:line; Z could borrow it" reports, that's an
adoption-loop accelerator. FA could run this nightly and surface
unexploited patterns from across the ecosystem before they go stale.

Worth a separate session to verify whether meta-vengine does this today
or needs the upgrade.

### ResearchGravity cadence

Empirical: re-sweep monthly with a 5-paper budget per query. More frequent
burns Gemini quota for diminishing returns. The four papers that landed in
FriendlyFace (BioZero, Mohammed, SDD, plus the canonical LIME/SHAP) span
2016-2025 — quant finance research moved meaningfully in 2025-2026 with
attention-based factor models, episodic memory for trading agents, and
end-of-day regime detection improvements. Re-sweep is overdue.

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
