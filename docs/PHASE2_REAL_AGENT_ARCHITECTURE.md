# Tacit Phase 2 — Real Agent Architecture

**Branch:** `phase2-real-agents` (isolated from the submission tag `submission-final-2026-07-20`).
**Rule:** no Daml/DAR/package-id/frozen-semantics changes; no deploy to the live URL; kyvern/sage untouched.

## 1. Current vs. target

| Layer | Today (submission) | Phase 2 target |
|---|---|---|
| Buyer plan | LLM → **one** service proposal (`shared/agentPlanner.ts`) | Goal + total budget → **task graph** (security / performance / both) with per-task ceilings |
| Buyer orchestration | `work.ts` runs a single procurement per job | A **durable state machine** across many tasks with reconciliation/recovery |
| Provider bid | `runner/src/pricing.ts quotePrice()` — **always bids** | **BID / DECLINE / NEED_CLARIFICATION** from an independent private policy |
| Provider policy | one `CostPolicy` (base × margin × load) | + capability manifest, **capacity**, min-margin floor, deadline fit |
| Selection | fixed lowest-eligible policy (frozen `Rfs.Award`) | unchanged (award stays frozen) — buyer only chooses *which tasks* to buy |
| Decision record | agentTrace (real steps) | typed **AgentDecisionEvent** journal, structured (no chain-of-thought) |
| Recovery | idempotent on jobId via ledger | + a durable journal so a long-running buyer resumes exactly |

The economic + privacy rail (sealed bids, authorize-before-award, atomic award/pay, private delivery,
buyer verification, auditor receipt, USD.demo, SpendMandate ceiling) is **preserved unchanged**. Phase 2
replaces the *closed orchestration* with independent, stateful decision loops.

## 2. Persistence choice

No database exists (ledger is truth; session is a signed cookie). For the buyer runtime's durable
journal I choose a **file-backed append-only JSON journal** keyed by `agentRunId`, under a configurable
dir (`TACIT_AGENT_JOURNAL_DIR`, default `.agent-journal/`, gitignored). Why: smallest reliable mechanism
with zero new runtime deps, matches the "ledger is truth" rule (the journal only stores *orchestration*
state + command ids + digests, never overrides ledger facts), and reconstructs deterministically. The
**reconciliation logic is pure** (`shared/agent/reconcile.ts`) and unit-tested; the file I/O is a thin
impure shell (`app/lib/agentJournal.ts`).

## 3. Typed state machine (buyer)

```
DRAFT → GOAL_PARSED → PLAN_PROPOSED → (human) PLAN_APPROVED
      → PROCURING (per task: OPEN → BIDS → AWARD → DELIVER → VERIFY)
      → [task fail → RECOVERING → replan/replace within remaining budget]
      → AGGREGATING → DECIDED → RECEIPTED
      | any → PAUSED_THROTTLED (ledger 503) | FAILED (budget/again) | REFUSED (goal invalid)
```
Every transition emits an `AgentDecisionEvent`. Economic truth is re-derived from Canton on resume;
the journal supplies orchestration state + idempotency keys.

## 4. Idempotency

Every ledger write key = `sha256(agentRunId · taskId · actionType · policyVersion)`. Reconciliation
replays the journal against live ledger state; an action whose effect already exists on-ledger is
skipped (no duplicate request/spend). Proof: kill after a write → restart → reconcile → no dup.

## 5. Threat boundaries (agent-safety)

Untrusted: user goal text, fetched website content, provider output, **model output**, agent cards.
- Model output is **always** parsed through a strict schema + deterministic policy gate
  (`shared/agent/gates.ts`). It can never set budgets, parties, tool allowlists, privacy rules, award
  policy, or ledger commands directly — those come from the human mandate + registry only.
- Tool calls stay behind the existing SSRF/IP-pin/timeout/byte-cap controls; model picks only from an
  explicit allowlist per task.
- No ledger/wallet secrets or competitor data ever enter a model prompt.
- Prompt injection in goal/content cannot alter authority (tested).

## 6. Interop

MCP stays the host-AI→Tacit edge (unchanged). A2A is **not** added for branding this phase; provider
boundaries are shaped so a remote adapter can bind an Agent Card to a Canton party + key later.

## 7. Build checkpoints (this branch)

- **[x] P1 — pure agent core + proofs (DONE, tested).** `shared/agentCore.ts` (schemas + injection-
  resistant gates + verifyEvidence), `shared/taskPlanner.ts` (multi-task planner), `shared/providerDecision.ts`
  (BID/DECLINE/NEED_CLARIFICATION), `shared/agentReconcile.ts` (crash recovery). `npm run test:agents` —
  **13 proof groups green** (all 10 mandatory proofs + runtime).
- **[x] P4 core — durable run machine (DONE, tested).** `shared/agentRun.ts` (stateful multi-task loop
  + verified-only aggregation); `app/lib/agentJournal.ts` (file journal) + `app/lib/buyerAgentRuntime.ts`
  (orchestrator composing the tested core with an injected `procure` fn — testable, decoupled from the
  live ledger). Typechecks + builds.
- **[ ] P2 — model-backed task selection** behind `parseModelTaskSelection` (the gateway nudges `needs`;
  the gate + planner stay authoritative). Wiring point ready in `createRun(opts.modelBacked)`.
- **[ ] P3 — provider decision engine wired into the runner** (a live provider genuinely declines).
  `decide()` is ready; the runner bid loop calls it before `quotePrice`.
- **[ ] P5 — Decision Room UI** from `runRecord()` structured events (extends `/work`).
- **[ ] P6 — live adversarial/crash/privacy verification** (needs a runtime host + un-throttled ledger).

Not deployed — the submission URL still serves tag `submission-final-2026-07-20`.

## 8. Mandatory proofs → where enforced

1. budget→plan variety — `taskPlanner.planTasks` (test) · 2. provider decline — `providerDecision.decide`
(test) · 3. independent prices — per-provider policy (test) · 4. no competitor data — architecture
(providers read only own bids; unchanged) · 5. crash recovery — `reconcile` (test) · 6/7. malformed +
injection rejected — `gates.parseGoal` / `gates.parseModelPlan` (test) · 8. bad digest rejected —
existing buyer verify (unchanged) + `verifyEvidence` (test) · 9. can't exceed mandate — allocator clamps
to mandate; ledger `Authorize` is the hard stop (test + preserved) · 10. green gates + 0 Daml diff (CI).
