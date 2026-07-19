# Tacit — submission release candidate

## User wallet + human-first product — a real person on Canton (2026-07-19)

Turned "agents playing with demo credits" into a product a real user shows up and uses. The human
**principal** is now a first-class participant, not an invisible party.

- **`/wallet` — your workspace on Canton (live).** Shows the user's real Canton identity
  (`TacitPrincipal::1220a14c…`), their agent, and the **ledger-enforced budget** they grant it —
  with a big live balance, a spend/limit bar, and their on-ledger **spend history** (each
  `SpendAuthorization` the agent recorded). Real principal-side actions: **Top up** (`TopUp`),
  **Revoke** (`Revoke`), **Grant** (create `SpendMandate`) — all real on-ledger writes. A live
  `TopUp(+250)` was confirmed on devnet (mandate → **1000/1000 USD.demo**). These are single
  lightweight submits, so they **succeed even while a full procurement burst is rate-limited** — the
  page always has a working on-ledger interaction to demo.
- **Repositioned human-first.** Hero → "Your AI agent hires a private market — on a budget you
  control"; primary CTA → **Open your workspace**; "How it works" gains step **00 · You set the
  budget**. Nav leads with **Wallet**.
- **Endpoints:** `GET /api/wallet` (workspace), `POST /api/wallet/{topup,revoke,grant}` — flag-gated
  (honest 404 off), throttle → calm 503. Deployed + verified live at 1440 and 375.
- **Real Canton Coin, live (Splice Amulet).** The wallet now shows the **real on-ledger Canton Coin
  balance** of this validator's onboarded Amulet wallet (`32,039,…​ CC`, devnet), with a working
  **“Tap 10 devnet CC”** button that **mints real Canton Coin** from the devnet faucet (a real Amulet
  contract). Wired via the Splice Validator/Wallet API (`app/lens/ledger/coin.ts`, `GET /api/coin`,
  `POST /api/coin/tap`) using the same OAuth credential — **without touching the frozen settlement
  Daml.** Verified live (balance read + a real tap → new Amulet + balance moved).
- **Honest scope:** job *settlement* still moves a `USD.demo` voucher; the CC panel proves the real
  Canton Coin rail is wired and a party holds + acquires real CC on devnet. Per-user CC custody and
  CC-denominated settlement are the stated roadmap.

---


## Final product pass — judge-path polish, planner 18/18, mandates ACTIVATED live (2026-07-19)

Perfecting the exact path a judge walks. No new features. Everything within the shipped design
system. **Deployed to the live origin** (rsync + rebuild with `NEXT_PUBLIC_APP_URL` + restart
`tacit.service` only — runners, nginx, and the co-hosted projects untouched).

**Planner reliability — the item-A gate + fix.** The VM env had **no `TACIT_LLM_FALLBACK_MODEL`**
(believed set, wasn't). Primary is `deepseek/deepseek-v4-flash` on CommonStack. `planner-smoke` ×3
= **17/18** with that alone — and both losses were gateway **timeouts** ("could not produce"), not
misclassifications (every answered case classified correctly; all 9 paraphrase points passed). Added
`TACIT_LLM_FALLBACK_MODEL=google/gemini-2.5-flash` (reuses the existing key — no new secret); a
primary timeout now falls through to the fallback. `planner-smoke` ×3 with the fallback = **18/18**.
The few-shot prompt was left unchanged (tuning can't cure a timeout).

**Mandates ACTIVATED on the real Canton devnet.** Devnet writes had recovered enough to bootstrap:
- `tacit-mandate` DAR (`f3e2d2a9…`) uploaded; principal `TacitPrincipal::1220a14c…` allocated +
  granted `CanActAs`; initial `SpendMandate` created (limit 500 → **750 after a live `TopUp(+250)`**,
  unrestricted scope). `TACIT_MANDATE_MODE=on` + `TACIT_PRINCIPAL_PARTY` set; `tacit.service` restarted.
- **Live + proven:** `GET /api/mandate/status` → `enabled:true`, remaining **750 of 750**;
  `StandingMandatePanel` renders on `/work` idle ("enforced on-ledger"); the **402 over-budget
  pre-check refuses live with ZERO ledger writes** ("This mandate has 750 demo credits remaining,
  below the … ceiling"); an on-ledger **`TopUp` succeeded**.
- **Marginal-throttle disclosure (honest):** single submits succeed, but a **full procurement**
  (a burst of ~10 rapid submits) still trips the devnet write-throttle, so the procure route returns
  **503** and the designed **`ThrottleView`** engages — the honest-throttle UX doing its job. Two
  things are therefore *not yet* shown live end-to-end: (a) a complete procurement's authorization +
  decrement, and (b) the on-ledger over-limit `assertMsg` (the live attempt was masked by the same
  throttle error). Both are proven by the local `daml:test:mandate` matrix (8 scenarios); the live
  proof completes on fuller write-recovery via `npm run preflight:mandate --deep`.

**Mandate UX.** New **`MandateRefusalView`** — the 402 `MANDATE_INSUFFICIENT` case now has its own
*designed* state (was the generic error view): kicker "standing mandate · enforced on-ledger",
headline "Over your standing budget — refused before spending", and the honest note that the
read-only pre-check ran **before any ledger write** (nothing spent, no bids solicited). Verified live
(zero writes). Pre-check reasons sentence-cased. Success-view spend-authorization evidence row + note
verified by code (a Row structurally identical to the shipped Settlement/Receipt rows). Panel
layout-stable at 1440 **and 375** (no horizontal overflow).

**Micro-trust.** Styled in-system **404** (`app/not-found.tsx`) — was Next's default — now **live**.
**OG fixed live**: `og:image` was `http://localhost:3000/art/ogimage.png` (built without
`NEXT_PUBLIC_APP_URL` + a stale heavy 1.4 MB asset); consolidated the landing to the canonical
`/og.png` (1200×630) and rebuilt with the env → now `https://tacit.80-225-209-190.sslip.io/og.png`.
Per-route titles/descriptions present; consoles clean; `/market` refresh zero-layout-shift.

*Item E (a landing "mandated-spend" line) remains **held** by choice:* though mandates are now live,
the landing copy already matches the mechanics without a mandate claim, and the standing-mandate
story is told where it belongs — on `/work`.

---

## Endgame recovery pass — Pass 7 shipped, honest-throttle UX, activation runbook (2026-07-19)

Pass 7 (the on-ledger spending mandates, below) is now **committed + pushed** on `main`
(`292f534`..`8e7dc2b`, five logical commits: daml package / app surfaces / mcp / scripts / docs).

**Recovery probe.** One probe procurement through the live HTTPS API confirmed the shared
devnet validator is **still rate-limiting writes** from our credential — HTTP 403
`"A security-sensitive error has been received"` (gRPC code 7). We did **not** poll further.
Mandate activation therefore stays deferred; the exact ≤14-write, ~15-minute activation
sequence is captured in [`docs/ACTIVATION_RUNBOOK.md`](ACTIVATION_RUNBOOK.md) to run the moment
writes recover.

**Honest-throttle UX (ships regardless of recovery).** A judge who hits the outage now sees
engineering maturity, not a broken app:
- `shared/ledgerErrors.ts` `classifyLedgerError()` — pure + unit-tested (`npm run test:ledger-errors`,
  6 checks) — maps the write-throttle class (403 security-sensitive / PERMISSION_DENIED / gRPC 7
  / RESOURCE_EXHAUSTED / 429) **distinctly** from an unreachable ledger and from genuine command
  failures.
- `/api/work/procure` returns a distinct **HTTP 503** with `reason: "LEDGER_WRITE_THROTTLED"` and
  `retryable: true` (was a generic 502). Nothing is started or spent.
- `/work` renders a **designed Clear-material state** (not a red error): *"Canton devnet is
  rate-limiting writes right now"* — reads (market, lens) stay live, the job wasn't started,
  nothing was spent, and **Try again** safely reuses the same jobId. Reactive-only — **no
  write-canary** (canaries cost writes). Verified locally against a mock throttled ledger
  (reads 200, submit 403); screenshot captured at 1440.
- MCP: all three procure tools map the throttle to a clean `isError` with the honest,
  non-fabricating message.

Frozen packages byte-identical (`git diff daml/ daml3/ tacit-work/` = 0). Full unit suite green
(16 suites / 260 assertions). No fallback, no simulation.

---

## On-ledger spending mandates — a human budget the ledger itself enforces (2026-07-19)

A human principal grants the buyer agent a **private budget envelope** as a Daml contract; every
procurement **authorizes its spend against that envelope on-ledger** immediately before the award,
and an exhausted mandate means the **LEDGER refuses the spend** — not the app. This is the
payments-track "agents coordinate commercial actions safely" pillar, delivered as the program's
**only unfreeze**: one new, **standalone, additive** Daml package `tacit-mandate`
(`f3e2d2a9…`) with **no data-dependency** on the frozen packages (it links to jobs by `Text`
jobId/rfsId). The frozen `tacit` (`fdfbfcf0…`) and `tacit-work` (`9ab077f2…`) are **byte-identical
this pass** — `git diff daml/ daml3/ tacit-work/ daml3-test/ tacit-work-test/` is **0 bytes**.

**Feature-flagged, OFF by default.** `TACIT_MANDATE_MODE` unset/`off` ⇒ **today's behavior,
bit-for-bit**: no mandate code path runs (every branch in `work.ts` is guarded by `mandateModeOn()`,
and every response addition is an optional/spread-guarded field, so the `/api/work/procure` JSON
and the `/work` UI are byte-for-byte unchanged), and `/api/mandate/status` returns **404**. `on`
adds a read-only **pre-check** (over-budget ⇒ HTTP **402 `MANDATE_INSUFFICIENT`**, **zero ledger
writes**) and a **spend authorization** exercised immediately before `Rfs.Award`.

**Honesty — the sequencing is disclosed, not hidden.** Authorization and award are **two separate,
sequential Canton transactions — NOT atomic.** The invariant we claim and prove is only that the
**award never precedes authorization**: `Authorize` is exercised right before the award, and its
failure aborts the procurement before any IOU is created or payment moves. Over-budget / expired /
out-of-scope refusals are **real on-ledger command failures** (`assertMsg` inside the `Authorize`
choice) — there are **no simulated refusals** anywhere.

**Privacy is a feature, by design.** A `SpendMandate` is signed by the principal and observed by the
agent **only**; the **auditor is NOT a stakeholder** — mandates are confidential. `testAuditorExcluded`
proves the auditor's ledger query returns `[]`. Nothing about mandates appears on `/market`, and no
mandate values are logged.

**Proven locally (the ledger half is aborted for this submission).** `npm run daml:test:mandate`
(8 scenarios / 18 checks: authorize-decrements, over-limit-fails, service-scope, expiry, topup-restores,
revoke, authority-separation, auditor-excluded) and `npm run test:mandate` (8 pure-logic checks) are
**green**. Per the risk posture, the DAR upload + party allocation were **not** performed: the hosted
devnet was **refusing WRITES** (HTTP 403 `PERMISSION_DENIED`) from this credential (a transient
per-credential write-throttle observed earlier this session; reads unaffected), and this environment
holds **no devnet credentials** (secrets live only in the VM env, by design). So the **ledger half is
aborted** — the flag stays **OFF**, the app changes are **dormant and proven bit-for-bit**, and the
running product is **untouched**.

**To turn it on when devnet writes recover** (from the VM, with the devnet env sourced):
`npm run devnet:bootstrap:mandate` (uploads the DAR, allocates + grants a `TacitPrincipal`, creates a
`SpendMandate` limit 500) → set `TACIT_MANDATE_MODE=on` + `TACIT_PRINCIPAL_PARTY` → verify with
`npm run preflight:mandate` (status readable · exact-decrement · over-budget 402 zero-writes · resume
idempotency · `--deep`: a direct over-limit `Authorize` **fails on the ledger**, then `TopUp` restores).
Env is documented in `.env.example`; the MCP gains `tacit_mandate_status`.

---

## Planner hardening — the Agent console can't flake mid-demo (2026-07-15)

The Buyer-Agent planner (the demo centerpiece) now self-corrects. `shared/agentPlanner.ts`
(pure, unit-tested, no mock server) runs one fresh model attempt, and if the **hard gate**
(`validateAgentPlan`) rejects it, one **structured-repair** attempt that feeds the model its
own output plus the exact rejection reason and demands corrected strict JSON. Only after a
model's fresh+repair both fail does it try an **optional fallback model**
(`TACIT_LLM_FALLBACK_MODEL`; absent = current behavior). The prompt gained **five few-shot
examples** (goal → exact JSON) spanning both services and both policy families. Honesty is
unchanged: every proposal from every model passes the same hard gate; exhausting all attempts
returns `{ok:false, reason}` — **never a fabricated proposal**. Evidence: `npm run test:planner`
(5), `npm run planner:smoke` (6 live calls: 3 landing chips + 3 fresh paraphrases → hard-gate-
valid with the expected service + policy family), and `npm run demo:prime` (one real job per
service + health + feed + smoke + cert days — the button to press before recording).

The one live flake this session was **latency, not correctness**: the LLM gateway was slow
(~40s per call) and the old 15s ceiling aborted slow-but-correct calls. Fix: 45s timeout +
skip the same-model repair after a timeout (a re-ask won't be faster) + the few-shot prompt.
Measured flake table (3 smoke runs, degraded-gateway night):

| | before (15s) | after (45s + repair + few-shot) |
|---|---|---|
| landing chips (the cold-visitor tap path) | flaky | **9/9 = 100%** |
| free-typed paraphrases | flaky | 6/9 = 67% (gateway-latency-limited) |
| overall | 6/18 = 33% | **15/18 = 83%** |

The tap-a-chip demo path is reliable; a rare free-typed miss falls back honestly to Manual —
never a fabricated proposal. (Normal gateway latency is 3–5s → ~100%.) The `/work` composer
now shows a "this can take up to a minute on a busy model" hint during planning.

---

## Landing + first-run onboarding — 10 seconds to understand, under a minute to a real result (2026-07-15)

The landing was rewritten inside the existing design system (no new tokens, fonts, or
deps). It makes a stranger understand Tacit fast and reach a real on-ledger result quickly.

- **Hero (10-second comprehension):** a display-serif statement — *"AI agents hiring AI
  agents — in private."* — plus one subline carrying the whole lifecycle (goal → sealed
  bids → atomic award + on-ledger pay → private delivery → buyer re-hash + score recompute
  → auditor receipt). CTAs: **Run a real assessment →** (/work) · **See the live market →** (/market).
- **Live proof strip** under the hero reads `/api/market/overview` at render time — real
  completed jobs · total volume (demo credits) · capable agents n/3 · services live + an
  `asOfUtc`. **No hardcoded live numbers anywhere**; if the endpoint is unreachable the
  strip hides gracefully. The footer's suite/assertion count is imported from
  `docs/verification-manifest.json` at build.
- **Sections:** Problem (why agent commerce leaks on public rails) · How it works (four
  real steps mapped to the real nouns — the sealed-bid step rendered in the **Frost**
  material) · Live market preview (a real receipts slice with Frost "Sealed" body cells) ·
  For agents (the three MCP tool names + a config snippet) · **Honest scope** as a designed
  section (demo voucher, one shared validator credential, passive pre-screen not a
  certification, buyer-verifies-not-Canton) · footer.
- **Claims discipline:** every landing sentence is true of the shipped product today —
  no roadmap presented as shipped; currency always labelled "demo credits."

**First-run onboarding on `/work`** — the zero-typing cold-start path:
- **Example-goal chips** in the Agent composer (span both services + policy families);
  tap fills the composer, the user reviews and submits.
- A **dismissible first-run 3-step strip** (agent proposes → you approve → real work runs +
  verified), remembered in `localStorage`, never shown again once dismissed.
- Empty-state guidance (any public HTTPS endpoint; `example.com` works; budget is demo
  credits, default is plenty) and a Manual→Agent pointer.
- A **"what just happened" success recap** — three plain lines + links to `/market`
  ("your job is now in the public feed — body sealed") and `/lens`.

---

## Live market — the auditor's lawful view, a proof of the privacy model (2026-07-12)

`/market` ("The market, from the auditor's chair") is a live agent-economy dashboard
computed **entirely from on-ledger contracts the pinned Auditor party can lawfully
see** — Settlements and DeliveryReceipts. It is itself a **proof of the privacy model**:
it *can* show settlements, winners, amounts, times, byte lengths, and SHA-256
commitments because the auditor is a stakeholder of those; it *cannot* show sealed
bids or report bodies, because the auditor is not a stakeholder of a `SealedBid` or a
`PrivateDelivery` and **Canton simply does not return them**. Every receipt row wears a
"report body: sealed 🔒" lock — the row *is* the story: work happened, evidence was
committed, content stayed private.

- **Ledger-derived, no store:** `GET /api/market/overview` queries live as the auditor
  at request time (15s read cache, `asOfUtc` on every response). No app-side job
  history, no seeded or timer-driven activity. It launches with genuine history —
  days of preflights left real settlements/receipts on devnet.
- **Auditor-view discipline:** the response carries commitments/amounts/winners/times/
  byteLen/serviceType only. It **never** contains sealed bids, bid prices, report
  bodies, or any `http(s)://` target — we deliberately drop the on-ledger `title`
  (which can embed a target host). A preflight scans the raw body to enforce this.
- **Work-path scoped + internally consistent:** treasury/volume/wins derive from
  **delivery receipts joined to their settlement**, so `totalVolume == Σ perService.volume
  == Σ provider.earned`. Settlements without a receipt (older negotiate-demo deals the
  auditor can also see, or awarded-but-undelivered work) are excluded.
- **Treasury integrity (proven live):** `npm run preflight:market` (**19 assertions**)
  recomputes each provider's treasury from an **independent raw-Canton auditor query**
  (zero shared code) and it matches exactly; it then reconciles against each provider's
  active `Iou` balance, **scoped to work-path**. Live example (asserted by the preflight,
  numbers grow as jobs run): Provider C's raw Iou balance `1031.07` = work treasury `614.3`
  + **`416.77` excess = pre-existing negotiate-demo Ious** (reported, not asserted away —
  the auditor cannot see Ious, so this read is done as each provider; A and B sit at `0`).
  The market's displayed volume sums **only auditor-observed** settlements, so the old
  negotiate-demo deals (no auditor observer) correctly never appear.
- **Real competition (pricing bookkeeping fixed):** an earlier phantom-load bug in the
  runner's private pricing inflated a chronic loser's bid without bound (measured live:
  B quoting `98`, A `74` vs C `27` on comparable requests) — `load` counted *every bid
  ever placed*, so lost bids never cleared. Fixed: in-flight is now recomputed **live from
  the ledger each tick** — won-but-undelivered assignments + own bids on still-open
  requests — so a **lost bid clears immediately** (its `ActiveWorkRequest` is consumed on
  award and yields no `Assignment`). On redeploy A/B collapsed to base pricing at once
  (B `98 → ~35`), **no state migration, bid-idempotency untouched**. The three runners are
  now **configured specialists** via `RUNNER_SERVICE_COST_JSON` (private, never leaked):
  **A = security** (vendor 18 / perf 26), **C = performance** (vendor 24 / perf 18),
  **B = generalist** (20 / 22), margin 0.2. At zero load every quote for both services
  sits ≤ 50% of the default budget (100), so the default flow always gathers 3 in-budget
  bids; spreads are modest enough that one concurrent same-service job can flip a winner
  via live load. Prices are a **pure function** of (per-service cost, request complexity,
  real workload) — no randomness, history never rewritten. `/market` now shows per-service
  win chips + a "recent form (last 15)" bar; the sealed bids themselves stay private.
  **Live proof (8 real HTTPS jobs, mixed services, 2 at the default budget, 2 concurrent
  pairs):** vendor jobs → **Provider A** (security specialist), perf jobs → **Provider C**
  (performance specialist) → **2 distinct winners**; both default-budget jobs gathered 3
  in-budget bids; concurrency lifted the winner's quote 31.77 → 35.06 (live load repricing).
  The market now shows A = 5 vendor wins (recent form rising) vs incumbent C — real
  competition, not a single dominant agent.
- **MCP 0.6.0:** `tacit_market_overview {}` gives an agent the same auditor view — check
  a provider's track record before hiring, without seeing anything private.
- **Live:** https://tacit.80-225-209-190.sslip.io/market. `demo:check` asserts it healthy.

---



## Second real service: `web_performance_probe` — a new vertical, zero Daml changes (2026-07-12)

Tacit is now a **two-market** exchange. Alongside vendor security, buyers can hire the
same three provider agents for a **real web-performance measurement** — and this second
market was added with **zero changes to the ledger model and zero new runtime
dependencies**. Both services ride the *same frozen* `tacit-work` template; only
`serviceType`, `serviceInput`, and `reportJson` differ.

- **What the winner really does:** resolves the target with **SSRF-hard, IP-pinned**
  networking, negotiates HTTP version via **ALPN**, and takes **5 timed samples**
  (connect / TLS / TTFB / total, byte-capped) over fresh sockets. The report carries
  per-sample numbers, min/median/max aggregates, transfer + caching posture, redirect
  chain, findings, and a banded score.
- **Determinism contract (identical to vendor):** the **score is a pure function of the
  report** — every point is a line in `scoringBreakdown`. On acceptance the buyer
  **recomputes the score from that breakdown** and rejects any mismatch, exactly as it
  re-hashes the committed bytes. Timings are honest and vary; the *score* does not.
- **Service-scoped policy:** `latency-slo-standard-v1` (default) / `latency-slo-strict-v1`.
  `evaluatePolicy` dispatches by `report.service`; a policy from the wrong service is a
  **precise error** ("standard-saas-v1 is not valid for service web_performance_probe"),
  and `validateAgentPlan` refuses a cross-service policy up front.
- **Every buyer surface:** `/work` service selector (vendor | performance) with a
  perf `PerformanceSection` (aggregates, per-sample TTFB bars, transfer/caching chips);
  the agent planner picks the service **by intent**; MCP gains `tacit_probe_performance`
  (v0.5.0). **No LLM anywhere** in measurement, scoring, or policy.
- **Proven live on devnet (example.com):** HTTP/2 · median TTFB **452 ms** · band
  **fast** · score **100** · **0** findings · policy `latency-slo-standard-v1` →
  **approve** · winner providerC @ **21.76 USD.demo** · `providerCommittedSha256 ==
  buyerComputedSha256` `d391208e…`. `preflight:probe` **29/29**, vendor regression
  `preflight:agentic` **35/35** — no fallback, no Daml change.
- **Verify:** `APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-probe.mjs --require-ledger --require-runners`.
  `npm run demo:check` now asserts **both** services at a 3-runner quorum.

---



## Buyer Agent Console — a real LLM procurement agent (2026-07-12)

`/work` is now **console-first**: an **Agent** tab (default) where you describe an
onboarding in plain English, plus the full **Manual** form (preserved). The LLM has
**exactly two touchpoints, both OFF the work path**:

1. **Plan** — `POST /api/agent/plan {goalText}` asks a server-side, env-configured
   OpenAI-compatible model to return strict JSON `{serviceType, input:{url}, policyId,
   maxBudget, confidence, assumptions[]}`. This is a **proposal only** — nothing is
   spent. `validateAgentPlan` (pure, in `shared/services.ts`) is the **hard gate**: it
   re-checks service registration + availability quorum, the https/SSRF input validator,
   the policy id, and budget bounds, and **fails closed** on anything else. The human
   approves the resulting **mandate card**, which then calls the real, no-fallback
   `/api/work/procure` (`requestSource:"console"`).
2. **Brief** — `POST /api/agent/brief {workResult}` asks the model, grounded on ONLY a
   projection of the **already-verified** WorkResult, for a ≤120-word plain-English
   explanation. It cites nothing not in the JSON and **decides nothing** — `evaluatePolicy`
   remains the only decision-maker. Rendered above the verified sections, labeled
   "Agent brief — generated; verified data below."

**Honest failure:** if the LLM is unconfigured, times out, or returns garbage, `/plan`
returns `{ok:false, reason}` (never a fabricated proposal) and the user sees the Manual
form; `/brief` returns `{ok:false}` and the verified result stands alone. The LLM never
invents findings, scores, prices, or decisions. During procurement, agent-voiced
narration is keyed **deterministically** to real ledger stage transitions (no LLM, no
timers). The console and MCP `tacit_assess_vendor` are the same buyer path, two clients.

- **New env (add to `~/tacit-devnet.env`; server-side only, never in the client bundle):**
  `TACIT_LLM_PROVIDER`, `TACIT_LLM_MODEL`, `TACIT_LLM_API_KEY`, `TACIT_LLM_BASE_URL`.
  Falls back to the existing `GRADIENT_*` config, so it deploys without re-provisioning.
- **Verified:** `npm run preflight:console` (plan fails closed on hostile inputs incl.
  prompt-injection + SSRF; **key-aware** — asserts honest failure when no key is set AND,
  when a key IS set, that any returned proposal independently re-passes the pure hard gate
  and carries no decision/score/price; a real `requestSource=console` procurement completes
  with the deterministic policy + buyer verification). Plan-validator unit tests in
  `npm run test:services`. Frozen Daml unchanged. **The deployed VM now has a real LLM key,
  so the Agent tab is live** (proposal only — validation remains authoritative).

---



## submission-rc2 — agentic vendor-security product (2026-07-12)

Tacit is now **a private work exchange for software agents, launching with vendor
security.** An external MCP agent (or the `/work` UI) hires three competing provider
agents; the winner performs a **real passive vendor-security assessment**; the buyer
verifies (hash + schema + target + score) and a deterministic policy decides; an
auditor gets the receipt, not the report. Frozen Daml packages unchanged.

- **Live:** https://tacit.80-225-209-190.sslip.io/work · MCP `tacit_assess_vendor`.
- **Proven live on devnet (through HTTPS):** agentic vendor e2e **35/35** + original
  privacy **11/11**, no fallback. Manifest: [verification-manifest.json](verification-manifest.json) (195 assertions across 11 suites — two live services + the auditor-view market).
- **Fresh live evidence (example.com):** real TLSv1.3 / Cloudflare cert / 48d · score
  59 "weak" · 8 findings · policy `standard-saas-v1` → **human_review** (score:59) ·
  winner providerC @ 20.77 USD.demo · `providerCommittedSha256 == buyerComputedSha256`
  `4145de81…` · settlement `00897135…` · receipt `005fd6e9…`.
- **Verify:** `APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-agentic.mjs --require-ledger --require-runners`.
- **New since rc1:** registered-service registry (`shared/services.ts`), real
  `vendor_security_assessment` adapter (passive, SSRF-hard, IP-pinned), autonomous
  provider dispatch, buyer acceptance hardening + deterministic policy engine, MCP
  `tacit_list_services`/`tacit_assess_vendor`, agentic `/work` + landing, read-only
  ledger-derived `/api/work/status`. Honest limitations below still apply; `site_audit`
  retained for resumption only.

---



**Cut:** 2026-07-12 (UTC) · **tag:** `submission-rc1` (on `main`) · **prior product tag:** `work-phase1b-product`

Judge-operable, HTTPS, live on the real Canton devnet. This document is the single
source of truth for the submission.

## Public URLs (HTTPS, publicly-trusted certificate)
| What | URL |
|---|---|
| Product story (landing) | https://tacit.80-225-209-190.sslip.io |
| **Tacit Work** (run a real private procurement) | https://tacit.80-225-209-190.sslip.io/work |
| **Live market** (the auditor's lawful view) | https://tacit.80-225-209-190.sslip.io/market |
| Ledger Lens (per-party privacy) | https://tacit.80-225-209-190.sslip.io/lens |
| Work readiness | https://tacit.80-225-209-190.sslip.io/api/work/health |
| Health | https://tacit.80-225-209-190.sslip.io/api/health |
| Repo | https://github.com/shariqazeem/tacit |
| Emergency origin (NOT judge-facing) | http://80.225.209.190:3200 |

## TLS
- **Hostname:** `tacit.80-225-209-190.sslip.io` (durable IP-derived DNS via sslip.io → 80.225.209.190).
- **Issuer:** Let's Encrypt (R/YE intermediate). **SAN:** `tacit.80-225-209-190.sslip.io`.
- **Validity:** 2026-07-12 → **2026-10-10**. **Renewal:** certbot systemd timer (auto).
- **Redirect:** `http://…` → `https://…` (301). **Trust:** external `curl` TLS verify = 0. **Mixed content:** none.
- **Proxy:** nginx vhost `tacit` → `http://127.0.0.1:3200` (300s read/send timeouts for the long work flow; `/api/*` uncached). Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`. No HSTS on the shared parent.

## Packages (frozen, unchanged)
- **Core `tacit`:** `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` (Daml 3.4.11).
- **Work `tacit-work`:** `9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed` (data-dependency on the frozen core).

## Live evidence — fresh work run through HTTPS (2026-07-12T01:49:04Z)
- **Mode:** `devnet` · **provider runners:** 3 ready, distinct instances + PIDs (`providerA/B/C-vm`).
- **Parties:** Buyer + Provider A/B/C + Auditor, all `Tacit43kf…::1220a14c…`.
- **Sealed bids:** A `42.18`, B `61.63`, **C `19.78` (winner)** USD.demo — each priced by its own private policy.
- **Settlement:** `003f630bf0c21c495360b7aa3378246d7fc4fa8ab0a67f8f49003ec9fc9a421202…`
- **Payment IOU:** `00698adee2232d28a98f0f7dae5b2f92ef6a6d7bc2060066c91b530b4c36292717…` (`19.78 USD.demo`)
- **Assignment:** `0049f89575f964792000247b2ec71f748afc0ef958f05f3fda8f9d591ce85714f1…`
- **Private delivery:** `008538352c85328cd77ec9e6dab5f9609c399653b35d50cbefcdad0259d4fcd4a5…`
- **Delivery receipt:** `006d899ac2480f154521d2c64cd93d4cce01a7be47218ac294d5189403e3918478…`
- **Audit:** `https://example.com` → HTTP **200**, **27 ms**, score **40**, **631-byte** artifact.
- **Buyer SHA-256 (off-ledger) == on-ledger commitment:** `53974c1aef5267af215cf703ead98050cc41473b216e762034861378eb412372` ✅
- **Original privacy proof:** 11/11. **Work proof:** 48/48. **No fallback** in either.

> Note: Phase-1A/1B evidence in `docs/WORK_EVIDENCE.md` / `docs/DEVNET_EVIDENCE.md` was captured
> before HTTPS (over the raw-IP origin); the contract ids there are historical and still valid.

## Verify it yourself (through HTTPS)
```bash
# read-only readiness (no ledger job):
npm run demo:check
# real work run — 48/48 (bids, award+prepay, audit, delivery, buyer hash, receipt, tamper, idempotent):
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-work-e2e.mjs --require-ledger --require-runners
# original 11 privacy invariants:
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-e2e.mjs --require-ledger
```

## Deployment state (no private paths)
- `tacit.service` — active (Next.js app on `127.0.0.1:3200`, mode `devnet`).
- `tacit-runner-a` / `-b` / `-c` — active (loopback health `127.0.0.1:7011/7012/7013`).
- `nginx` — active (adds only the `tacit` vhost; `kyvernlabs` / `sage` / `kyvern-commerce` untouched).
- Other user services on ports **3000/3001** were **not touched**.
- **VM app source matches** the tagged public `main` (sha256 of key files verified equal).

## Rollback (does NOT touch the ledger or runners)
1. **App code:** `git -C ~/tacit-app` is a copy, not a repo — to roll back, re-sync the previous tag
   (`work-phase1b-product`) from GitHub and rebuild, or restore the kept build: `~/tacit-app/.next.bak.phase1b`.
2. **Restart:** `sudo systemctl restart tacit.service` (service-scoped; runners keep running).
3. **Proxy:** to revert HTTPS, `sudo rm /etc/nginx/sites-enabled/tacit /etc/nginx/conf.d/tacit-upgrade.conf && sudo nginx -t && sudo systemctl reload nginx` (the cert stays installed harmlessly).
4. **Emergency origin:** `http://80.225.209.190:3200` remains live throughout.
5. **Post-rollback checks:** `npm run demo:check` (read-only) + `curl -s http://80.225.209.190:3200/api/work/health`.

## Honest limitations
- Three runners are **separate processes with distinct Canton parties** but share **one** hosted-validator
  OAuth credential — **not** separate validators or organizations.
- `USD.demo` is a **demo voucher** — not real money, a stablecoin, or Canton Coin.
- The buyer acts through the **pinned buyer party**; a `buyerLabel` is a display label only.
- Hash matching is performed by the **buyer application off-ledger**; the Receipt records acceptance of
  committed bytes, **not** objective report quality. Canton did not verify the report's correctness.
- **Two real service adapters** ship: `vendor_security_assessment` and
  `web_performance_probe`. `site_audit` is retained for resumption/back-compat only.
  Both real services are **passive/read-only** against the target (no auth, no writes).
- Historical (already-accepted) report bodies are **not reconstructed** by the active-contract reader —
  a resumed job honestly reports this; fresh runs show the full report.
