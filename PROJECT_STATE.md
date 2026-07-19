# Tacit — Complete Project State (2026-07-19)

> A single, self-contained snapshot of the whole project — the idea, what it does, every page and
> how it looks/feels, the backend, the on-ledger contracts, deployment, and honest limitations.
> Written so any AI agent or engineer can understand the entire current state without the codebase.

---

## 1. The one-liner

**Tacit is a private work exchange for AI agents on the Canton blockchain.** A human opens an account,
gives an AI **procurement agent** a **private, ledger-enforced spending budget**, and the agent hires a
competitive market of specialist agents to do real work — through **sealed bids**, **atomic on-ledger
payment**, **private delivery**, and **cryptographic verification** — while an auditor gets a receipt but
**never the report**. Privacy is enforced by the ledger itself, not promised by the app.

**Tagline on the site:** *"Your AI agent hires a private market — on a budget you control."*

Hackathon: **Encode × Canton Foundation** — track **"Payments, Neobanking & Agentic Commerce"**
(with strong relevance to "Private DeFi / B2B marketplace with blind auctions"). Requirement: deployed
live on **Canton Devnet** with Daml contracts running on-ledger. ✅ Satisfied.

**Live URL:** https://tacit.80-225-209-190.sslip.io
**Repo:** https://github.com/shariqazeem/tacit

---

## 2. The problem it solves

Put a procurement market on a transparent chain and you leak your whole strategy: every bid price,
your budget ceiling, your vendor list, and the deliverable become public. Tacit runs the market on
**Canton**, where each party sees only the contracts it is a *stakeholder* of. A competitor is not a
stakeholder of your bid, so the ledger never hands it over. As AI agents start transacting with each
other, they need (a) **privacy** and (b) **spending controls a human can trust** — Tacit is both.

---

## 3. What it actually does (the core loop)

1. **A human creates an account** → gets their own **Canton party** (identity) + a **private budget**
   (a `SpendMandate` contract) they fund and control.
2. **They describe a job in plain English** → an LLM **planner** turns it into a validated proposal
   (service + target + policy + budget). The LLM only *proposes*; it never decides or invents facts.
3. **The buyer agent opens a sealed request** → three separate **provider agent processes** each submit
   a **`SealedBid`**. The ledger hides every price from the other providers.
4. **The agent authorizes the spend against the human's budget on-ledger** (a real `Authorize` choice —
   the ledger *refuses* an over-budget spend), then **awards + pays** the lowest bid **atomically** (one
   Canton transaction: losing bids archived, `Settlement` created, a demo-credit IOU moves to the winner).
5. **The winner performs real work** (a live website security/performance check) and **delivers the report
   privately** — visible only to buyer + winner.
6. **The buyer re-hashes the exact bytes off-ledger** (SHA-256) and recomputes the score to verify the
   delivery, then **Accepts** → a **`DeliveryReceipt`** is written for a permissioned **auditor** (the
   commitment hash, winner, amount, time — never the report body).

Everything above is **real on the Canton devnet** — real parties, real contracts, real atomic settlement.

---

## 4. Architecture (big picture)

```
   Browser (Next.js app)          MCP clients (any AI agent over stdio)
          │                                   │
          ▼                                   ▼
   ┌──────────────────────── Tacit App (Next.js 15) ──────────────────────┐
   │  Pages: / /wallet /work /market /lens                                │
   │  API routes: account, wallet, coin, work, agent, market, mandate…    │
   │  app/lens/ledger/*  — the ONLY seam to Canton (facade + adapters)    │
   └───────────────┬──────────────────────────────────┬──────────────────┘
                   │ v2 JSON Ledger API (OAuth2)        │ Splice Validator/Wallet API
                   ▼                                    ▼
        5North HOSTED Canton devnet validator   (real Canton Coin / Amulet wallet)
        ledger-api.validator.devnet.sandbox.fivenorth.io
                   ▲
                   │ (bid / deliver as their own parties)
   ┌───────────────┴───────────────┐
   │  3 provider runner processes   │  (runner/  — standalone TS/ESM, zero runtime deps)
   │  Provider A · Provider B · C   │  each bids + performs work as a distinct Canton party
   └────────────────────────────────┘
```

- **The app never manufactures bids.** Three separate OS processes (the runners) bid as distinct parties.
- **All Canton access goes through `app/lens/ledger/`** — a facade (`client.ts`) over adapters
  (`adapters/cantonV2.ts` for devnet, `adapters/sandboxV1.ts` legacy). Swappable, single seam.
- **Hosting:** one Ubuntu VM (`vm3`, IP `80.225.209.190`). The app + 3 runners connect *out* to
  **5North's hosted validator** (the shared "Seaport Validator Development Access"). We do **not** run our
  own Canton node — this is the sanctioned hosted-validator model. The VM also hosts two unrelated
  projects (kyvern, sage) that Tacit never touches.

---

## 5. Tech stack

- **Frontend/app:** Next.js 15 (App Router, RSC), React 19, TypeScript 5, Tailwind CSS v4,
  framer-motion (motion), `next/font` self-hosted fonts. Zero external runtime UI deps beyond these.
- **Fonts:** **Fraunces** (editorial serif — display/decision/numerals), **Inter** (all UI), **JetBrains
  Mono** (evidence only: contract ids, hashes, amounts).
- **Ledger:** Canton 3.x, **v2 JSON Ledger API** (`/v2/...`), OAuth2 client-credentials (8h token).
- **Daml:** 3.4.11. Three packages (see §9).
- **Runners:** standalone TypeScript/ESM, **zero runtime dependencies** (only Node built-ins).
- **MCP server:** `mcp/server.ts` — stdio JSON-RPC, thin client over the app's HTTP API.
- **LLM (planner + brief only, never on the work path):** CommonStack gateway (OpenAI-compatible),
  primary `deepseek/deepseek-v4-flash`, fallback `google/gemini-2.5-flash`.
- **No database.** All state is on the Canton ledger; the app reads it live. Session accounts use a
  signed cookie only.

---

## 6. The pages — what's on them and how they look/feel

**Global design language (applies to every page):** warm paper background (`#FAFAF9`), a three-tint ink
ramp, a single **violet `#7C3AED`** accent used only for interactive/brand moments, generous whitespace,
hairlines over shadows. Two "materials": **CLEAR** (white card, one hairline — public/verifiable facts)
and **FROST** (translucent blurred panel with a mono "Sealed" lock caption — used *only* where Canton
actually withholds data). A fixed top nav (**Wallet · Work · Market · Lens**) with a live "● live · devnet"
readiness pill. Page enters = fade + 8px rise; `prefers-reduced-motion` collapses all motion to instant
end-states. No horizontal overflow at 375px. Honesty colors: `--live #0D9488` (teal), `--fallback #B45309`.

### `/` — Landing (server-rendered)
- **Hero:** Fraunces headline *"Your AI agent hires a private market — on a budget you control."* + a
  human-first subhead, a **frosted glass prism** refracting light (the brand art), and a **live stats
  strip** read from the ledger (completed jobs, total volume, capable agents 3/3, services live).
- **CTAs:** primary **"Open your workspace →"** (`/wallet`), then "Run a live assessment →" (`/work`),
  "How it works ↓".
- **Sections:** *The Problem* (four "public leak" cards), *How it works* (steps **00 You set the budget**,
  01 Sealed bids [with 3 frosted "Sealed bid" chips], 02 Atomic award + payment, 03 Private delivery
  verified, 04 Receipt for compliance), *Live Market preview* (auditor's view table with a Frost
  report-body column), *For agents* (MCP config + tool list), *Honest scope* (4 plainly-stated limits),
  footer with the live test-suite count read from the manifest.
- **Feel:** editorial, calm, confident; magazine-grade typography; nothing flashy, privacy-as-material.

### `/wallet` — Your workspace on Canton (client component `WalletExperience`)
The human's control room. Two states:
- **New visitor (no account):** a **"Create your account on Canton"** onboarding — kicker "Get started",
  Fraunces headline, honest copy (*"No wallet extension, no seed phrase — your keys are custodied by the
  validator, the way Canton works"*), 3 numbered steps, and a **"Create my account →"** button ("Free ·
  devnet · starts with 500 demo credits"). One tap mints their own Canton party + budget.
- **Signed-in account:** kicker "Your workspace · Canton devnet"; headline *"Your agent, on a budget you
  control."*; two identity cards (**Your Canton identity** = your principal party, **Your procurement
  agent** = the buyer party, both copyable mono ids); a **violet-tinted budget hero** ("618 / 750
  USD.demo remaining", a progress bar, spent/scope/expiry) with an **Add budget** control (+100/+250/+500
  chips + input + "Add budget →", a real on-ledger `TopUp`, with a teal "✓ confirmed on-ledger" note),
  "Send your agent to work →", and "Revoke agent's budget" (amber); a **teal-accented "Real Canton Coin ·
  devnet · Splice Amulet"** panel showing the live on-ledger CC balance (e.g. 32,040,465 CC) with a **"Tap
  10 devnet CC →"** button that mints real Amulet + an honest note that settlement still uses demo
  credits; and a **spend history** list (each `SpendAuthorization`: service, jobId, timestamp, −amount)
  with a note that the auditor never sees it.
- **Feel:** a premium neobank account screen — big numerals, clear controls, everything labeled as
  on-ledger, honest about custody.

### `/work` — Buyer Agent Console (client component `WorkExperience`)
Where a job runs. Idle screen: kicker "Buyer agent console · Canton devnet", headline "Tell your
procurement agent what you need.", readiness stat-chips, a first-run explainer strip, the
**StandingMandatePanel** ("STANDING SPEND MANDATE · enforced on-ledger · X of Y remaining"), and an
**Agent / Manual** tab toggle:
- **Agent tab:** a plain-English goal box + example chips → "Plan the mandate →" → the LLM returns a
  **Proposed mandate card** (service, target, policy, budget) → **Approve** → the real job runs.
- **Manual tab:** service radio (vendor security / web performance), URL, policy, budget → run.
- **Running:** ledger-derived progress stages (no timers) with agent-voiced narration, and a **Frost
  sealed-bid moment**.
- **Success:** a decision hero, an agent trace, the artifact with **provider-committed vs. buyer-computed
  SHA-256** side by side, a **Spend-authorization evidence row** + "separate Canton transaction" note,
  buyer verification checks, the deterministic policy decision, a "What just happened" recap, and a
  **Work Privacy Lens** (persona switcher showing what each party actually received on-ledger).
- **Designed error states:** **MandateRefusalView** (a calm 402 "Over your standing budget — refused
  before spending", triggered by the zero-write pre-check) and **ThrottleView** (the honest "Canton devnet
  is rate-limiting writes right now — nothing started, nothing spent" state).

### `/market` — The market from the auditor's chair (server-rendered, 15s live refresh)
Headline "The market, from the auditor's chair." Live stats (completed jobs, total volume, capable
agents, services). Three **provider cards** (A/B/C) with treasury, wins, all-time win-share bar, recent-
form bar, and per-service win chips. A **"Sealed delivery receipts"** table (time, SHA-256 commitment,
winner, amount, service, and a **Frost "body SEALED"** column). Everything is computed live from the
contracts the auditor party can *lawfully* read — sealed bids and report bodies never appear. Numerals
transition value with **zero layout shift**.

### `/lens` — Ledger Privacy Lens
"One deal, five views" — a persona switcher (buyer, provider A/B/C, auditor) showing exactly what Canton
reveals to each party on one deal; the auditor sees the receipt (Frost/sealed), never the report.

### `404` (`app/not-found.tsx`)
In-system styled 404: "That page isn't on the ledger." with links to the three real routes.

---

## 7. API routes (`app/api/*`)

| Route | Method | Purpose |
|---|---|---|
| `/api/account` | GET | current session account (their party) or null |
| `/api/account/create` | POST | mint a custodial account (allocate party + grant budget), set signed cookie |
| `/api/wallet` | GET | the session account's workspace (identity, budget, history) |
| `/api/wallet/topup` | POST | real on-ledger `TopUp` (raise budget) |
| `/api/wallet/revoke` | POST | real on-ledger `Revoke` (archive mandate) |
| `/api/wallet/grant` | POST | real on-ledger create `SpendMandate` (re-grant) |
| `/api/coin` | GET | real Canton Coin (Amulet) balance via Splice Wallet API |
| `/api/coin/tap` | POST | mint real Canton Coin from the devnet faucet |
| `/api/work/procure` | POST | run a real procurement (the core loop); gated by the account's budget |
| `/api/work/health` | GET | readiness: ledger reachable + 3 distinct ready runners + per-service quorum |
| `/api/work/status` | GET | ledger-derived lifecycle progress for a job |
| `/api/work/services` | GET | the registered-service catalog |
| `/api/agent/plan` | POST | LLM planner: goal → validated mandate proposal (hard-gated, repair+fallback) |
| `/api/agent/brief` | POST | LLM prose explanation of an already-verified result |
| `/api/market/overview` | GET | the auditor's lawful market view (recompute-verified) |
| `/api/mandate/status` | GET | the agent's standing-mandate summary |
| `/api/economy` | GET | ledger economy read |
| `/api/health` | GET | app + Canton liveness |
| `/api/negotiate` | POST | legacy demo negotiation endpoint |

Common rules: flag-gated features return an honest **404** when off; a devnet write-throttle maps to a
calm **503 `LEDGER_WRITE_THROTTLED`**; over-budget maps to **402 `MANDATE_INSUFFICIENT`** with zero writes.

---

## 8. Backend / ledger modules (`app/lens/ledger/`)

- **`client.ts`** — the facade: `create`, `exercise`, `queryAs`, `ensureParty`, `pinnedParty`, template
  ids (`T`), package ids, ledger-mode. Delegates to the active adapter.
- **`adapters/cantonV2.ts`** — the real devnet adapter (v2 JSON Ledger API + OAuth2). Handles the v2
  quirks (commands nested under `commands`, `userId` = token user, template refs by `#package-name`),
  party allocation + `CanActAs` grants, and **retry-with-backoff on the write-throttle 403**.
- **`adapters/sandboxV1.ts`** — legacy Daml-2 sandbox adapter (offline).
- **`work.ts`** — buyer-side orchestration of the full fulfillment lifecycle (open → sealed bids → verify
  → authorize spend → award+pay → assign → private delivery → off-ledger hash verify → accept → receipt),
  with real per-persona visibility snapshots. Idempotent on `jobId`. Spends only the requesting account's
  mandate (`forThisAccount`).
- **`mandate.ts`** — the spending-mandate client: agent-side (query mandates/authorizations, `authorizeSpend`)
  and principal-side (`topUpMandate`, `revokeMandate`, `grantMandate`, `getWorkspace`).
- **`account.ts`** — custodial accounts: HMAC-signed session cookie, `createAccount` (party + mandate),
  `sessionPrincipal`/`effectivePrincipal`.
- **`coin.ts`** — real Canton Coin via the Splice Validator/Wallet API: `getCoinStatus` (balance), `tapCoin`.
- **`market.ts` / `economy.ts` / `read.ts`** — auditor-view market aggregation + ledger reads.
- **`runnerHealth.ts`** — polls the 3 runner health endpoints; computes per-service quorum.
- **`workTypes.ts`** — the shared response contract (schema-versioned) used by API, UI, MCP, preflights.

Pure, unit-tested logic lives in **`shared/`** (`services.ts` registry+policies, `agentPlanner.ts`,
`market.ts`, `mandate.ts`, `ledgerErrors.ts`) and is synced into the runner build.

---

## 9. Daml packages (on-ledger contracts)

Three packages, all deployed on devnet. **The first two are frozen (byte-identical across all work this
session):**

1. **`tacit`** (core, id `fdfbfcf0…`) — `Tacit.Sealed`: `Rfs`, `SealedBid`, `Settlement`, `Iou`. The sealed-
   bid auction + atomic award/pay. Sealed bids are stakeholder-only; `Award` archives losers + moves the IOU.
2. **`tacit-work`** (id `9ab077f2…`, data-depends on core) — `TacitWork`: `RequestDraft`,
   `ActiveWorkRequest`, `Assignment`, `PrivateDelivery`, `DeliveryReceipt`. The generic work lifecycle
   (service-agnostic via `serviceType`/`serviceInput`/`reportJson`). Private delivery + auditor receipt.
3. **`tacit-mandate`** (id `f3e2d2a9…`, **standalone**, no data-dependency — links to jobs by `Text`) —
   `Tacit.Mandate`: **`SpendMandate`** (signatory principal, observer agent — the auditor is NOT a
   stakeholder, by design) with choices **`Authorize`** (agent; `assertMsg` refuses over-budget/out-of-
   scope/expired → recreates mandate with decremented balance + emits `SpendAuthorization`), **`TopUp`**
   (principal), **`Revoke`** (principal); and **`SpendAuthorization`** (co-signed by principal + agent,
   confidential). 8-scenario Daml test matrix, all passing.

Honesty invariant (stated in UI + docs): authorization and award are **sequential** transactions, **not
atomic** — the guarantee is only that *the award never precedes a successful authorization*.

---

## 10. The provider runners (`runner/`)

Three separate standalone Node/TS processes (zero runtime deps), each acting as a distinct Canton party
(Provider A/B/C). Each: polls for open requests, prices the job with a private per-service pricing model,
submits a `SealedBid`, and — if it wins — performs the **real work** and delivers privately. Services:
- **`vendor_security_assessment`** — a passive public web-security posture check (TLS cert facts, security
  headers, cookies, DNS/CAA/MX/SPF/DMARC, security.txt), deterministic findings + versioned score. SSRF-
  hardened + IP-pinned. *Not* a pentest.
- **`web_performance_probe`** — 5 fresh-connection latency samples (TTFB/TLS/total), transfer + caching
  posture, ALPN HTTP version. A bounded pre-screen, not a load test.
- **`site_audit`** (legacy, retained for resumption/back-compat).
The buyer independently recomputes each service's score from the report's own breakdown before Accept.

---

## 11. MCP server (`mcp/server.ts`, v0.7.0)

Any MCP-speaking AI agent can hire the market directly over stdio JSON-RPC. Tools: `tacit_health`,
`tacit_work_health`, `tacit_list_services`, `tacit_procure` / `tacit_procure_work`, `tacit_assess_vendor`,
`tacit_probe_performance`, `tacit_market_overview`, `tacit_mandate_status`, `tacit_my_deals`,
`tacit_explain_privacy`. Same buyer path as the web console — two clients, one backend. The LLM only
proposes; a deterministic policy decides.

---

## 12. The three "money/trust" systems (what makes it a product)

- **Custodial accounts** — each visitor mints their **own Canton party + budget** (one tap on `/wallet`),
  tracked by an HMAC-signed cookie. Keys are validator-custodied (honest neobank model; Canton has **no
  self-custody browser wallet** — this is stated plainly in the UI). Verified live on devnet.
- **On-ledger spending mandate** — the human grants the agent a budget the **ledger itself** enforces; an
  over-budget spend is refused by a real `assertMsg`, not app code. Pre-check refuses over-budget jobs
  with zero writes (HTTP 402). The human tops up / revokes with real on-ledger writes.
- **Real Canton Coin** — the wallet reads the real on-ledger Amulet balance and can **tap the devnet
  faucet to mint real CC** (Splice Wallet API). *Settlement itself* still uses a `USD.demo` voucher; real-
  CC settlement is the stated roadmap (it would require changing the frozen settlement Daml).

---

## 13. Deployment & environment

- **VM:** Ubuntu `vm3` @ `80.225.209.190`. App dir `/home/ubuntu/tacit-app` (rsync target, not a git
  checkout). Launcher `/home/ubuntu/run-tacit.sh` sources `/home/ubuntu/tacit-devnet.env` then
  `next start -p 3200`. systemd units: `tacit.service` + `tacit-runner-a/b/c.service`.
- **Deploy flow:** rsync source → `npm run build` (with `NEXT_PUBLIC_APP_URL` in scope, so OG/metadata bake
  correctly) → `sudo systemctl restart tacit.service`. Runners restart only if their code changes.
- **HTTPS:** nginx vhost + Let's Encrypt at `tacit.80-225-209-190.sslip.io` → `127.0.0.1:3200`.
- **Key env:** `TACIT_LEDGER_MODE=devnet`, `TACIT_V2_API_URL=https://ledger-api.validator.devnet.sandbox.
  fivenorth.io`, `TACIT_V2_AUTH=oauth` (client `validator-devnet-m2m`), `TACIT_PARTIES_JSON` (pinned
  parties), `TACIT_MANDATE_MODE=on` + `TACIT_PRINCIPAL_PARTY`, `TACIT_WALLET_API_URL` (Splice wallet),
  `TACIT_LLM_*` (+ `TACIT_LLM_FALLBACK_MODEL`). **All secrets live only in the VM env — never in the repo.**
- **Parties (namespace `::1220a14c…`):** buyer `Tacit43kfBuyer`, `ProviderA/B/C`, `Auditor`,
  `TacitPrincipal` (global demo principal), plus per-user `TacitUser*` accounts. Validator party
  `5nsandbox-devnet-2`.

---

## 14. Honest scope & the ONE known limitation

Stated plainly on the site's "Honest scope" section:
- **Demo credits, not money** — settlement is a `USD.demo` voucher, not Canton Coin (though the real-CC
  rail is wired: balance + faucet tap).
- **One validator credential** — the 3 runners are separate processes/parties but share one hosted-
  validator credential (the shared "Seaport Validator Development Access"), not separate organizations.
- **Passive pre-screen** — assessments are passive public-surface checks, not pentests/certifications.
- **Buyer verifies, not Canton** — the app re-hashes + recomputes off-ledger; Canton proves who-saw-what
  and that payment happened, not that a report is objectively correct.

**The one soft spot — the devnet write-burst rate limit.** Because *all* hackathon teams share the one
`validator-devnet-m2m` credential on one 5North validator, a **full job's ~11-write burst** can be rejected
(`403 "security-sensitive"`) when the shared cap is saturated — at which point the app shows the honest
**ThrottleView** (nothing started, nothing spent). **Single writes always succeed** (account creation,
top-up, CC tap, the 402 refusal), and **/market shows 46 real completed jobs** proving the full loop works.
Mitigations in place: **retry-with-backoff** on the throttle in both submit paths; graceful 503 UX; the
durable fix is the organizers raising the shared limit or a dedicated validator (not our code).

---

## 15. Verification

- Unit suites (all green): services/policies/planner (28), work (18), market (13), mandate (8), planner
  (5), plus runner self-tests (vendor, probe, pricing). Daml mandate matrix: 8 scenarios.
- Live preflights (devnet): agentic vendor e2e, performance probe e2e, buyer-agent console, auditor-view
  market, original privacy invariants.
- Live-verified this session: mandate activation, real account creation, on-ledger TopUp, real Canton Coin
  balance + faucet tap, planner 18/18, OG/404.
- Frozen packages (`daml/`, `daml3/`, `tacit-work/`) are byte-identical (0-diff) — the only Daml addition is
  the standalone `tacit-mandate`.
- Evidence: `docs/verification-manifest.json`, `docs/SUBMISSION_RC.md`, `docs/ACTIVATION_RUNBOOK.md`.

---

## 16. The 30-second "why it wins"

It's a **real product on the real Canton devnet** that a person actually uses: open an account, get a
Canton identity + a ledger-enforced budget, delegate private competitive procurement to an AI agent that
**can't overspend you**, hold real Canton Coin, and watch an auditor get compliance without surveillance.
It leans into Canton's one unique thing — **privacy as a ledger property** — with sealed bids, private
delivery, and a confidential mandate, and it's **honest** about every limit instead of faking anything.
