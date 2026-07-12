# Tacit — Complete Current State (submission-rc2)

> **Tacit is a private work exchange for software agents on Canton — now a two-market exchange.**
> A procurement agent privately hires three competing provider agents; the winner performs a **real,
> passive** assessment — either a **vendor web-security posture** or a **web-performance probe**; the
> findings stay private to the buyer; the buyer verifies the delivery (hash + schema + binding +
> **score-recompute**) and a **service-scoped deterministic policy** produces a decision; and a
> permissioned auditor receives a receipt — **never** the report. The second market was added with
> **zero Daml changes and zero new runtime dependencies** — both services ride the same frozen
> `tacit-work` template, differing only in `serviceType` / `serviceInput` / `reportJson`.

- **Repo:** https://github.com/shariqazeem/tacit · **main:** `1a4c11f` (perf pass on `main`) · **prior tag:** `submission-rc2`
- **Live (HTTPS):** https://tacit.80-225-209-190.sslip.io — `/work` (the product) · `/lens` (privacy explorer)
- **Built for:** Build on Canton Hackathon (Encode Club). Last updated **2026-07-12**.
- **Frozen Daml packages (never modified):** core `tacit` = `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` · work `tacit-work` = `9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed`

---

## 0. TL;DR — what is real

Everything on the primary `/work` path is **real on the shared Canton devnet**: three separate OS
processes bid as distinct Canton parties, the winner runs a real passive network assessment of a
user-supplied HTTPS host, the report is delivered privately, the buyer verifies it off-ledger, a
deterministic policy decides, and an auditor gets a receipt. There is **no simulation/fallback on the
work path** — a failure is a clear non-200 / MCP error / visible error state.

Honestly disclosed limitations: the three runners share **one** hosted-validator OAuth credential
(not separate validators/organizations); `USD.demo` is a **demo voucher** (not money/stablecoin/Canton
Coin); the buyer acts through a **pinned** party (a `buyerLabel` is display-only); hash/schema/target/
score verification is **buyer-side, off-ledger** (Canton does not verify report correctness); each
service is a **passive pre-screen** (the security service is not a pentest/certification; the
performance service is not a load test or availability guarantee); **two production adapters** ship —
`vendor_security_assessment` and `web_performance_probe` — with `site_audit` retained for legacy
resumption.

### 0b. Second service — `web_performance_probe` (new market, zero Daml changes)

The winner resolves the target with **SSRF-hard, IP-pinned** networking, negotiates the HTTP version
via **ALPN**, and takes **5 timed samples** (connect / TLS / TTFB / total, byte-capped) over fresh
sockets. The report carries per-sample numbers, min/median/max aggregates, transfer + caching posture,
redirect chain, findings, and a banded score (`fast`/`moderate`/`slow`/`poor`). The **score is a pure
function of the report** — every point is a line in `scoringBreakdown`, and on acceptance the buyer
**recomputes the score from that breakdown** and rejects any mismatch, exactly as it re-hashes the
committed bytes. Timings are honest and vary; the score does not. Policies are **service-scoped**
(`latency-slo-standard-v1` / `latency-slo-strict-v1`); `evaluatePolicy` dispatches by `report.service`
and a cross-service policy is a precise error. Buyer surfaces: the `/work` **service selector**
(vendor | performance) with a perf `PerformanceSection`, the **agent planner** (picks the service by
intent), and MCP `tacit_probe_performance` (v0.5.0). **No LLM anywhere** in measurement, scoring, or
policy. Proven live on devnet against `example.com`: HTTP/2, median TTFB ~452 ms, band `fast`, score
100, policy → `approve`, buyer re-hash == provider commitment.

### 0c. Live market — the auditor's lawful view (`/market`, ledger-derived)

`/market` ("The market, from the auditor's chair") is a live agent-economy dashboard computed
**entirely from on-ledger contracts the pinned Auditor party can lawfully see** — `Settlement` +
`DeliveryReceipt`. It is a proof of the privacy model: it shows winners/amounts/times/byteLen/SHA-256
commitments because the auditor is a stakeholder of those, and it **cannot** show sealed bids or report
bodies because the auditor is not a stakeholder of a `SealedBid`/`PrivateDelivery` and Canton won't
return them (each receipt row wears a "report body: sealed 🔒" lock). `GET /api/market/overview`
queries live as the auditor (15s read cache, `asOfUtc`); **no app-side history store, no seeded data.**
The response carries commitments/amounts/winners/times/serviceType only — never bids, prices, report
bodies, or any `http(s)://` target (we drop the on-ledger `title`, which can embed a host). It is
**work-path scoped** (receipts joined to settlements) so `totalVolume == Σ perService.volume ==
Σ provider.earned`. Treasury integrity is proven by `preflight:market` (19 assertions): an independent
raw-Canton auditor recompute matches the displayed treasury exactly, and each provider's `Iou` balance
reconciles when scoped to work-path (the excess is pre-existing negotiate-demo Ious, reported). MCP
`tacit_market_overview` exposes the same auditor view so an agent can check a provider's track record
before hiring. Runner pricing was tightened to a competitive band (same base, margins 0.25/0.26/0.27)
so real-time load decides the winner going forward — history untouched.

---

## 1. The four agents

1. **External AI procurement agent** — a Claude/MCP client (or the `/work` browser UI) that receives a
   business goal ("assess this vendor for onboarding"), checks readiness, procures the assessment, and
   reads the structured, verified result to explain the decision. Real external entry point via MCP
   (`tacit_assess_vendor`).
2. **Buyer policy agent** — deterministic, inspectable application logic (`shared/services.ts`
   `evaluatePolicy`). It validates the delivered evidence and produces an onboarding decision
   (`approve | approve_with_conditions | human_review | reject`) from the *verified* report. **It never
   invents findings and never calls an LLM.**
3. **Provider agents A / B / C** — three separate durable Node processes (`runner/`), each a distinct
   pinned Canton party. They discover requests from Canton, price with a **private local policy**, submit
   their **own** sealed bid, and only execute after winning.
4. **Auditor / compliance party** — a permissioned Canton party that observes the request, settlement,
   and delivery-receipt commitment, but is **never** a stakeholder of a sealed bid or the private report.

The buyer procurement agent and the provider worker agents are **different actors**. The buyer never
manufactures a bid; each provider process creates its own `SealedBid` as its own party.

---

## 2. Job lifecycle (the primary vendor flow)

```
Business goal (onboard vendor X)
   ↓  external AI buyer chooses Tacit via MCP  (or a human uses /work)
Buyer policy selects vendor_security_assessment + budget + onboarding policy
   ↓  POST /api/work/procure  (serviceType=vendor_security_assessment, no fallback)
RequestDraft --Open--> (frozen Rfs + ActiveWorkRequest)      [buyer signs; 3 providers + auditor observe the AWR]
   ↓  each provider runner independently prices + creates its OWN SealedBid on Canton
Buyer waits for 3 valid runner bids → picks the lowest eligible
Rfs.Award  → atomically: archive losing bids, accept winner, transfer USD.demo IOU, create Settlement
ActiveWorkRequest.Assign(Settlement) → Assignment           [buyer signs; winner + auditor observe]
   ↓  ONLY the winning runner runs the real passive assessment
Assignment.SubmitDelivery(reportJson, sha256, byteLen) → PrivateDelivery   [winner signs; buyer observes ONLY]
Buyer verification (off-ledger, in order):
   1) recompute byte length   2) recompute SHA-256   3) strict JSON parse
   4) resolve registered service+version   5) validate full report schema
   6) verify request↔report binding (url/host/service/version)   7) recompute deterministic score
   (ANY failure ⇒ refuse Accept, no receipt)
PrivateDelivery.Accept → DeliveryReceipt                     [buyer+winner sign; auditor observes; NO report body]
Buyer policy agent evaluates the verified report → decision + reason codes + required actions
   ↓
WorkResult returned (report + evidence + verification + policy + agentTrace + per-party visibility)
```

Idempotency: reusing a `jobId` never opens/awards/pays/receipts twice — the orchestrator resumes from
existing on-ledger contracts. The `/api/work/status` endpoint reads this same ledger state for progress.

---

## 3. Daml model (FROZEN — never modified this program)

Two packages, both already on devnet; **not** rebuilt/redeployed. Privacy is a property of the ledger
(signatory/observer), not application code.

**Core `tacit`** (`daml/Tacit/Sealed.daml` v1 SDK 2.10.4; `daml3/Tacit/Sealed.daml` verbatim v2 SDK 3.4.11):
- `template Iou` — `issuer`, `owner`, `amount`, `currency`; `choice Transfer` (owner→newOwner).
- `template Rfs` — the request-for-service; `choice Award : ContractId Settlement` — the atomic award:
  reject losing bids, accept the winning `SealedBid`, `Transfer` the payment IOU to the winner, create
  the `Settlement`. All-or-nothing.
- `template SealedBid` — `signatory provider`, `observer buyer` **only** (the moat: a competitor is not a
  stakeholder, so Canton never returns it); `choice Accept`, `Reject`.
- `template Settlement` — records winner + amount + `paid = Some (amount, "USD.demo")`; observer includes
  the auditor when named.

**Work `tacit-work`** (`tacit-work/TacitWork.daml`, **data-dependency** on frozen `tacit`; generic via
`serviceType`/`serviceInput`/`reportJson`):
- `RequestDraft` — buyer draft; `choice Open : (ContractId Rfs, ContractId ActiveWorkRequest)` — creates the
  frozen `Rfs` + an `ActiveWorkRequest` atomically.
- `ActiveWorkRequest` — `serviceType`, canonical `serviceInput`, `maxBudget`; `observer invitedProviders +
  optional auditor`; `choice Assign(settlementCid) : ContractId Assignment` (validates buyer/rfsId/winner-
  invited/price≤budget/paid-present).
- `Assignment` — `observer winner + auditor`; `choice SubmitDelivery(reportJson, sha256, mediaType, byteLen)
  : ContractId PrivateDelivery` (controller = winning provider).
- `PrivateDelivery` — `signatory provider`, `observer buyer` **only** (not auditor, not losers); carries the
  canonical report bytes + commitment; `choice Accept(acceptedAt) : ContractId DeliveryReceipt` (controller
  buyer).
- `DeliveryReceipt` — `signatory buyer+winner`, `observer auditor`; carries `sha256`/`byteLen`/`acceptedAt`/
  `status` but **no report body**.

`byteLen`/all `Int` fields are Int64 → sent as **JSON strings** over the v2 API. Payment `amount` and
`Decimal`s are sent as strings too.

---

## 4. Ledger client abstraction

`app/lens/ledger/client.ts` is a facade over a mode-selected adapter. `TACIT_LEDGER_MODE` picks:
- `devnet` → `adapters/cantonV2.ts` (v2 JSON Ledger API + **OAuth2 client-credentials**) — **primary**.
- `canton3-local` → same `cantonV2` code (auth off/static; local Splice LocalNet) — dev insurance.
- `sandbox` → `adapters/sandboxV1.ts` (Daml 2.x v1 JSON API, dev JWT) — the offline DEMO FALLBACK tier
  used only by the legacy `/lens` negotiate demo; **never** by the work path.

`cantonV2` empirically-verified wire quirks (devnet): commands nest under a `commands` object; submit
`userId` must equal the token user (`6`); template refs use the package **name** (`#tacit`,
`#tacit-work`), not the hex id; the shared validator's `GET /v2/parties` hangs, so parties are **pinned**
via `TACIT_PARTIES_JSON` and `ensureParty` treats listing as best-effort (falls through to allocate).
OAuth token is cached + refreshed on 401; submit uses `submit-and-wait-for-transaction` with
`LEDGER_EFFECTS`. `app/lens/ledger/runnerHealth.ts` reads loopback runner health (safe fields only) for
the health/services endpoints.

Pinned devnet parties (prefix `Tacit43kf…`, shared fingerprint `1220a14ca128…`): Buyer, ProviderA/B/C,
Auditor; ledger-api user `6` granted `CanActAs` on each.

---

## 5. Registered-service architecture

`shared/services.ts` — one **pure** TypeScript contract (no node/execution code; browser-safe) shared by
the app, MCP, and the runner (copied to `runner/src/_shared.ts` at build time by `scripts/sync-shared.mjs`).
It defines, per service: the id, display name/description, input type + strict validator, **canonical
input** (sorted-key JSON bound to the AWR), deterministic complexity signals (no policy leak), the
report type + **strict validator**, request↔report **binding**, a safe result **summary**, and public
metadata. Registry:

- `vendor_security_assessment` (**default/launch**, v1, methodology `vsa-1.0`) — real, implemented.
- `site_audit` (**legacy**, retained for historical job resumption + backward compatibility; not the
  default; a shallow header/status audit).

Only registered services can be procured; an unknown service is a precise 400. A service is **available**
only when three distinct ready runners advertise it (runtime capability quorum), surfaced by
`/api/work/services` and `/api/work/health`. The buyer policy engine also lives here (see §8).

---

## 6. The vendor_security_assessment adapter (real work)

`runner/src/services/vendorAssessment.ts` (pure composition) + `runner/src/services/vendorObservers.ts`
(real node observers). A **passive, bounded** public web-security posture pre-screen — **no** exploitation,
port scanning, fuzzing, auth, JS execution, form submission, or path enumeration beyond `security.txt`.

Observed (all real, measured, bounded):
- **HTTP** — status, redirect chain (revalidated each hop, no HTTPS→HTTP downgrade), content-type, sampled
  bytes (cap 256 KiB), page title.
- **TLS** — protocol, authorized, cert issuer/subject summary, valid-from/to, days remaining, hostname
  match (from the live peer certificate).
- **Security headers** — HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame
  protection (X-Frame-Options / CSP frame-ancestors) with observed values.
- **Cookies** — counts + Secure/HttpOnly/SameSite coverage (**values never stored**).
- **DNS / mail** — CAA, MX, SPF, DMARC presence via bounded public queries (`present|absent|unavailable`).
- **`/.well-known/security.txt`** — presence/status under the same SSRF/redirect rules.

Findings are deterministic (stable id, severity `critical|high|medium|low|info`, category, evidence,
remediation). Scoring is versioned (`vsa-score-1`): every contribution derives from an observed field,
a critical transport/identity failure dominates (caps the band to `critical`), unavailable ≠ insecure, and
the buyer can **recompute the score from `scoringBreakdown`**. Report shape matches the shared
`VendorSecurityAssessmentReport`; canonical bytes + SHA-256 come from `runner/src/canonical.ts`.

**Safety / SSRF** (`runner/src/ssrf.ts`, reused + strengthened): HTTPS + :443 only; no credentials in URL;
reject loopback/private/link-local/CGNAT/multicast/metadata for IPv4 **and** IPv6; every redirect
revalidated. **DNS-rebinding defense:** the real observer resolves + SSRF-checks the host, then **pins**
the checked IP for the connection (correct SNI + Host header) via `node:https`, so there is no
check-then-reresolve gap. Observers are **injected** so unit tests use fixtures without the internet and
without weakening SSRF.

---

## 7. Provider runner (autonomous agent)

`runner/` — a standalone TS/ESM package (node built-ins only, zero runtime deps). One process per provider.
- **Identity:** distinct pinned Canton party + unique instance id + PID.
- **Capabilities:** `RUNNER_SERVICES` (default `vendor_security_assessment,site_audit`) — advertises only
  what it can execute.
- **Private policy (never on-ledger, never returned to buyer):** `RUNNER_BASE_COST`, `RUNNER_MARGIN`,
  `RUNNER_MIN_PRICE`, plus request complexity + local in-flight load.
- **Loop (`src/index.ts`):** `tickBids` polls `ActiveWorkRequest`; for each where it's invited + supports
  the service + input validates + the budget clears its floor, it prices and creates its **own**
  `SealedBid` (durable per-job idempotency in `src/state.ts`). Declines unsupported/invalid/unprofitable
  work by not bidding (bounded local reason). `tickDeliveries` polls `Assignment`; **only** if it's the
  named winner, it re-validates input, dispatches the registered adapter (`executeService`), and calls
  `SubmitDelivery` with the canonical bytes/hash/length. A failed execution records local failure and
  **never** submits a success artifact.
- **Health (`src/health.ts`, loopback only):** `{ ready, instanceId, pid, provider, label, partyShort,
  ledgerMode, services, state, lastHeartbeatUtc }` — no secrets/policy/paths/targets.

Deployed as systemd services `tacit-runner-a|b|c` (health `127.0.0.1:7011|7012|7013`).

---

## 8. Buyer orchestration + policy

`app/lens/ledger/work.ts`:
- `procureWork(params)` — the buyer agent. Guards devnet/reachable; validates serviceType+input via the
  registry; opens the request (idempotent, guarded on an existing Assignment); waits for 3 valid
  runner-created bids; `Rfs.Award` (creates the buyer IOU + settlement); `Assign`; waits for the winner's
  `PrivateDelivery`; runs the **acceptance verification** (hash→length→parse→schema→binding→score);
  `Accept` → receipt; evaluates the **policy**; snapshots **real per-party visibility** at the correct
  lifecycle points; builds the `agentTrace` (only events that occurred). No fallback.
- **Per-party visibility snapshots** (`snapCids`/`snapBool`): queries `SealedBid`+`ActiveWorkRequest` as
  buyer/A/B/C/auditor **before Award** (bids archived on award); `Settlement`+`Assignment` after Assign;
  `PrivateDelivery` **before Accept** (consumed on accept); `DeliveryReceipt` after. Returned as the
  `visibility` snapshot; the `/work` lens renders crisp/frosted cells from it (never hardcoded).
- `verifyDelivery` + separate `providerCommittedSha256` vs `buyerComputedSha256` (null on resume — the
  buyer never hashes an empty string and calls it verification).
- `workStatus(jobId)` — **read-only, ledger-derived** progress; a stage is true only when its contract
  exists (used by `/api/work/status`; no timers; not on the write path).

**Policy engine** (`shared/services.ts` `evaluatePolicy`): `standard-saas-v1` / `strict-infrastructure-v1`
→ `{ decision, reasonCodes (tied to findings/score), requiredActions (finding ids), policyId+version,
decidedAtUtc, statement }`. Deterministic; a critical transport/identity failure can **never** approve;
missing optional controls yield conditions/review, not exaggerated rejection. No LLM in the decision path.

---

## 9. API endpoints

| Method · Path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | app + ledger liveness | `{app, canton:{reachable,mode,ledgerUrl}, packageId}`; always 200 |
| `GET /api/work/health` | work readiness | base 3-runner readiness (`ok`) + per-service `serviceQuorum` + `launchService`/`launchReady`; safe runner list |
| `GET /api/work/services` | service catalog | public metadata + runtime `available` per service (no prices/policy) |
| `POST /api/work/procure` | **run a real procurement** | body `{jobId, serviceType?, input:{url}, maxBudget, policyId?, buyerName?, requestSource?}`; registry-validated + quorum-gated; **no fallback**; non-200 on any failure; returns the full `WorkResult` |
| `GET /api/work/status?jobId=` | ledger-derived progress | read-only; `{stages, bidsSeen, completed}`; safe to poll during procurement |
| `POST /api/negotiate` | **legacy** app-operated negotiate demo | powers `/lens`; may run in DEMO FALLBACK (labeled); not the product |
| `GET /api/economy?party=` | **legacy** per-party earnings | for the `/lens` economy strip |

`WorkResult` (schema 2) fields: `mode, jobId, rfsId, serviceType/Version, requestSource, buyerLabel,
input, parties{buyer,A,B,C,auditor}, bids[], winner, amount, currency, artifact{available, report,
providerCommittedSha256, buyerComputedSha256, byteLength, buyerComputedByteLength, verifiedThisRequest},
evidence{core/work pkg ids, settlement/paymentIou/assignment/delivery/receipt cids}, resumption{resumed,
historicalArtifactNotLoaded}, buyerVerification{hash/length/schema/binding/score/verified}, policy{…},
agentTrace[], visibility{available, per-persona bids/awr/settlement/assignment/privateDelivery/receipt}`.

---

## 10. Pages + the `/work` experience

**`/` (landing, `app/page.tsx` + `app/landing/*`)** — scroll story. Hero: *"Private work markets for
software agents. / Starting with vendor security."* Primary CTA **"Assess a vendor" → /work**; secondary
"Inspect ledger privacy → /lens". Beats: problem → mechanic → proof (Ledger Lens preview) → close (live
readiness). Server component; OG metadata via `NEXT_PUBLIC_APP_URL`.

**`/work` (the product, `app/work/*`)** — a client experience (`WorkExperience.tsx`) with states:
- **Idle** — kicker `PRIVATE VENDOR ASSESSMENT · CANTON DEVNET`; headline *"Let your procurement agent
  hire the right security agent."*; inputs: vendor/API/MCP **https** endpoint, **onboarding policy**
  selector (Standard SaaS / Strict infrastructure), max budget (USD.demo, disclosed as a demo voucher);
  readiness chips (Canton, `n/3 capable agents`, `vendor_security_assessment v1`) from `/api/work/health`;
  primary **"Assess this vendor →"** (disabled until truly ready — no fallback); expandable *"Use from an
  AI agent via MCP"* snippet. Footer: *"Devnet verified · no fallback"* + link to `/lens`.
- **Running** — *"Your procurement agent is working"*; elapsed timer; 3 provider identities; a lifecycle
  list (request opened → sealed bids → award+prepay → assignment → private delivery → verified+receipt)
  driven **only** by `/api/work/status` real ledger stages (each step confirmed by a real contract; no
  timers). Request source shown.
- **Success (progressive disclosure)** — (1) **Decision hero**: Approved / Approved with conditions /
  Human review required / Rejected, score ring + risk band, target, policy, reason codes, honest
  "technical pre-screen, not a certification" statement. (2) **Private assessment**: HTTP/TLS facts,
  security-header checklist, DNS/mail chips, cookies, security.txt, severity-ranked **findings with
  remediation**, limitations. (3) **Agent activity**: the factual trace (request→bids→award→assignment→
  delivery→verified→receipt→policy), noting the buyer agent is distinct from the provider workers.
  (4) **Private market**: three real bids, winner, award/prepay (USD.demo demo voucher), runner
  identities + shared-credential disclosure. (5) **Proof of delivery**: separate provider commitment vs
  buyer computation + schema/target/score checks + contract ids (copyable, http-safe fallback).
  (6) **Work Privacy Lens**: Buyer / Provider A/B/C / Auditor, each cell crisp or `🔒 PRIVATE` from the
  returned snapshot — switching to Auditor **frosts the report, keeps the receipt**. (7) New assessment CTA.
- **Resumed** — an idempotent replay after acceptance: shows the real settlement/receipt/commitment and
  honestly states the report + decision are not reconstructed (unless restored from this browser's
  `sessionStorage`). Never fabricates.
- **Error** — retains url/budget/jobId; **Retry safely** reuses the same jobId (ledger idempotent, no
  double pay); separate New assessment; never routes to simulation. `aria-live` announcements throughout.

**`/lens` (legacy privacy explorer, `app/lens/*`)** — the original sealed-bid negotiation demo with a
per-persona visibility lens (Public/Buyer/Provider A-C/Auditor). Preserved; demoted from the judge path;
may run in DEMO FALLBACK when the ledger is unreachable (clearly labeled).

---

## 11. MCP server (`mcp/`, v0.4.0, stdio; thin client of the app API)

Primary (Tacit Work — real, no fallback):
- `tacit_work_health` / `tacit_list_services` — readiness + registered-service catalog + quorum.
- **`tacit_assess_vendor`** `{ url, maxBudget, policyId?, jobId?, buyerLabel? }` — runs the real vendor
  procurement (`requestSource=mcp`); safe idempotent retry with the same jobId; returns structured content
  (target, score/band, findings+remediation, policy decision+reasons+actions, winner/amount, independent
  hashes + verification flags, settlement/receipt ids, privacy summary) sufficient for an AI to decide.
  `isError` on any non-200/incomplete verification; never a success-shaped object.
- `tacit_procure_work` — compatibility wrapper for the site_audit work spine.

Legacy (labeled): `tacit_health`, `tacit_procure` (negotiate; simulation-capable), `tacit_my_deals`,
`tacit_explain_privacy`. The vendor tool is the documented primary workflow; legacy tools cannot be
confused for it. Point `TACIT_APP_URL` at the live HTTPS origin.

---

## 12. Design system

Warm, premium, light. Tokens (`app/lens/components/theme.ts`): bg `#FAFAF9`, surface `#FFFFFF`, ink
`#0A0A0B` (+ 62%/38% tints), one violet accent `#7C3AED`, teal live `#0D9488`, restrained amber
`#B45309` for risk. Fonts: **Inter** (prose) + **JetBrains Mono** (data/contract ids). Motion: subtle
springs + a camera-like refocus for persona switches; **reduced-motion** respected. Restraint: white
cards, hairline borders, generous negative space, progressive disclosure (outcome → evidence → ledger
proof). The decision hero reads like an Apple-quality product outcome, not a compliance dashboard.
Responsive + no horizontal overflow at 375/390px; accessible labels, keyboard tabs, visible focus,
`aria-live` status, http-safe copy fallback. **No** dark dashboard, gradients-everywhere, neon, chat UI,
or package hashes above the useful result. No hardcoded invariant counts in the UI ("Devnet verified · no
fallback"; counts live in the generated manifest).

---

## 13. Privacy model (ledger-enforced; proven by live per-party reads)

| What | Buyer | Provider (own) | Provider (other) | Winner | Auditor |
|---|---|---|---|---|---|
| A request/settlement exists | ✅ | ✅ (invited) | ✅ (invited) | ✅ | ✅ |
| Provider X's sealed price | ✅ | ✅ (own only) | 🔒 | own only | 🔒 |
| Winner + amount (Settlement) | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| Assignment | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| **Private report body** (PrivateDelivery) | ✅ | 🔒 | 🔒 | ✅ | **🔒** |
| Delivery receipt (SHA-256 commitment) | ✅ | 🔒 | 🔒 | ✅ | ✅ (no body) |

Every cell is a real per-party Canton query captured at the correct lifecycle stage — not a hardcoded
matrix. The auditor holds the receipt commitment but **never** a sealed bid or the report body.

---

## 14. Deployment

- **VM:** OCI ARM `80.225.209.190`, app copy at `~/tacit-app`, private env `~/tacit-devnet.env`
  (chmod 600, **not** in repo).
- **App:** systemd `tacit.service` → `next start -H 0.0.0.0 -p 3200`, `TACIT_LEDGER_MODE=devnet`,
  `NEXT_PUBLIC_APP_URL=https://tacit.80-225-209-190.sslip.io`.
- **Runners:** systemd `tacit-runner-a|b|c` (via `run-runner.sh`), loopback health `7011|7012|7013`,
  advertising `vendor_security_assessment,site_audit`.
- **HTTPS:** nginx vhost `tacit` for `tacit.80-225-209-190.sslip.io` → `127.0.0.1:3200` (sslip.io =
  durable IP-derived DNS), Let's Encrypt cert (auto-renew, expires 2026-10-10), HTTP→HTTPS 301, 300s
  proxy timeouts for the long procurement, `/api/*` uncached, security headers
  (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` disabling camera/mic/geo, `X-Frame-Options: DENY`; no HSTS on the shared parent).
  The user's **other apps on ports 3000/3001 (kyvernlabs/sage) are untouched.**
- **Emergency origin (not judge-facing):** `http://80.225.209.190:3200`.
- **Rollback:** `~/tacit-app/.next.bak.rc1` + tag `submission-rc1`; `systemctl restart tacit.service`;
  ledger/runners untouched.

---

## 15. Environment variables

App/ledger: `TACIT_LEDGER_MODE`, `TACIT_V2_API_URL`, `TACIT_V2_AUTH`, `TACIT_V2_USER_ID`,
`TACIT_V2_STATIC_TOKEN`, `TACIT_DEVNET_TOKEN_URL`, `TACIT_DEVNET_CLIENT_ID`, `TACIT_DEVNET_CLIENT_SECRET`
(**never in repo**), `TACIT_DEVNET_AUDIENCE`, `TACIT_DEVNET_SCOPE`, `TACIT_PACKAGE_ID_V2`,
`TACIT_PACKAGE_NAME`, `TACIT_WORK_PACKAGE_NAME`, `TACIT_WORK_PACKAGE_ID`, `TACIT_PARTIES_JSON`,
`TACIT_RUNNER_HEALTH_URLS`, `NEXT_PUBLIC_APP_URL`. Runner: `RUNNER_PROVIDER_ID`, `RUNNER_PARTY`,
`RUNNER_LABEL`, `RUNNER_INSTANCE_ID`, `RUNNER_HEALTH_PORT`, `RUNNER_BASE_COST`, `RUNNER_MARGIN`,
`RUNNER_MIN_PRICE`, `RUNNER_POLL_MS`, `RUNNER_STATE_FILE`, `RUNNER_SERVICES` (+ the devnet ledger vars).
MCP: `TACIT_APP_URL`. Secrets live only in the private env / the 5North access PDF — never committed.

---

## 16. Verification (all green; no fallback in either live preflight)

`docs/verification-manifest.json` (generated, 6 suites, 96 assertions):
- `runner selftest` (legacy site_audit) — 7
- `vendorTest` (fixtures + **live example.com** + SSRF classes) — 12
- `test:services` (registry + policy) — 13
- `test:work` (work unit) — 18
- **`preflight:agentic`** — LIVE vendor e2e on devnet **35/35** (readiness/autonomy, real assessment,
  buyer verification, policy, privacy, tamper, idempotency) — verified locally **and through HTTPS**
- **`preflight:e2e`** — original sealed-bid privacy **11/11** (through HTTPS)

`npm run demo:check` — read-only readiness (HTTPS + cert + devnet + 3 runners + routes; no ledger job;
`--full` runs the real preflight). Latest live evidence: example.com → real TLSv1.3/Cloudflare cert/48d,
score 59 "weak", 8 findings, `standard-saas-v1` → **human_review**, winner providerC @ 20.77 USD.demo,
`providerCommittedSha256 == buyerComputedSha256` `4145de81…`.

npm scripts: `dev · build · start · typecheck · preflight:e2e · preflight:work · preflight:agentic ·
test:services · test:work · demo:check · daml:build/test:v1/v2/work · devnet:bootstrap · canton3:local ·
mcp:build/start`.

---

## 17. Security posture

- **No fallback on the work path** — a failure is a non-200 / MCP error / visible error state; no fake
  success, fixtures, random values, or timer-driven progress ever enter a production success.
- **SSRF** — HTTPS+:443 only, credential/host validation, IPv4+IPv6 private/loopback/metadata rejection,
  redirect revalidation, **IP pinning** against DNS rebinding; bounded redirects/bytes/records/duration.
- **Secrets** — OAuth secret, tokens, cert private key, runner policy values, party credentials, `.env`,
  and server paths are never in git, the API, the UI, logs, or MCP output. Secret-scanned each commit.
- **Passive only** — no exploitation, port scanning, fuzzing, auth, JS execution, or path enumeration
  beyond `security.txt`.

---

## 18. File map (key)

```
app/
  page.tsx                     landing (vendor-positioned)
  landing/*                    Hero/Problem/Mechanic/Proof/Close
  work/page.tsx                /work shell + metadata
  work/types.ts                UI type barrel + POLICY/DECISION/PERSONA meta
  work/components/
    WorkExperience.tsx         state machine (idle/running/success/resumed/error) + status polling
    WorkResult.tsx             decision hero → assessment → agent trace → market → verification → lens
    WorkLens.tsx               per-party privacy lens (from the returned snapshot)
    bits.tsx                   Card/Row/CopyId/StatChip/SectionTitle/LensCell
  api/work/{health,services,procure,status}/route.ts
  api/{health,negotiate,economy}/route.ts   (negotiate/economy = legacy /lens)
  lens/ledger/
    client.ts                  facade; work.ts orchestrator; workTypes.ts contract; runnerHealth.ts
    adapters/{cantonV2,sandboxV1,config,types}.ts
shared/services.ts             registry + schemas + validators + canonical + policy engine (pure)
runner/src/
  index.ts                     the runner loop (bid/deliver, capability, dispatch)
  services/{vendorAssessment,vendorObservers}.ts   real passive assessment
  {audit,ssrf,canonical,canton,state,health,config}.ts
  {selftest,vendorTest}.ts     runner tests
  _shared.ts                   GENERATED from shared/services.ts (gitignored)
mcp/server.ts                  MCP tools (tacit_assess_vendor primary)
daml/ · daml3/ · tacit-work/   FROZEN Daml (v1 / v2 / work package)
scripts/                       preflight-{e2e,work-e2e,agentic}.mjs · test-{services,work}.mjs ·
                               sync-shared.mjs · demo-check.mjs · devnet-bootstrap.mjs
docs/                          SUBMISSION_RC.md · verification-manifest.json · WORK_EVIDENCE.md ·
                               DEVNET_EVIDENCE.md
```

---

## 19. Roadmap (post-submission; not built)

Distinct validator credentials per provider (retire the shared-credential caveat) · a real settlement
asset replacing `USD.demo` · more registered service adapters · historical-artifact reconstruction ·
arbitrary external buyer parties (needs a validator that lists/allocates parties) · a custom domain.
Deliberately **not** in scope: Canton Coin/stablecoin, new Daml templates, arbitrary code execution,
provider-side LLM-generated facts, visual redesign.
