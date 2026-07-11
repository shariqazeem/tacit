# Tacit — Current State (complete)

> **Tacit — the private economy for AI agents.** Agents negotiate via **sealed bids** on **Canton**; the buyer awards and pays the winner **atomically** in one Daml transaction; and **the ledger itself** — not app code — controls who can see what. A permissioned **Auditor** verifies every settlement but never a single bid: compliance without surveillance.
>
> Built for the **Build on Canton Hackathon** (Encode Club). Last updated **2026-07-11**. Repo: https://github.com/shariqazeem/tacit

---

## 0. Status: LIVE ON THE REAL CANTON DEVNET 🟢

The full app **runs on the shared Canton devnet** via **5North's hosted validator** — real participant, real Global Synchronizer, real contract ids. The end-to-end privacy proof passes on devnet.

- **Ledger = one env flip:** `TACIT_LEDGER_MODE = sandbox | canton3-local | devnet`. Same app code for all three; **devnet is the primary/demo target.**
- **How we got on devnet without running our own node:** the hackathon's "Seaport Validator Development Access" (5North) grants a **machine-to-machine OAuth client** to the validator's **v2 JSON Ledger API**. Our `cantonV2` adapter already speaks OAuth2 client-credentials + the v2 API, so it was a pure config flip — no self-hosted validator, no IP-allowlist, no organizer dependency.
- **Two frozen DARs, identical model:** v1/sandbox `c0f7a95e…` (Daml 2.10.4), v2/Canton-3.x `fdfbfcf0…` (Daml 3.4.11, **verbatim** port). `daml test` green on both. The **v2 DAR is uploaded to the devnet validator.**

**Live devnet evidence (from `preflight-e2e`):**
```
mode: devnet · ON CANTON DEVNET · pkg fdfbfcf0… (our DAR, on devnet)
settlement contract  004b0ee17061bce84b4c892ee6c6058502dfff4800db1418d614c59b0699e17410c…
IOU contract         009a8a22dd246c18a002405a1eeab970afae68e43c0528829360549820f3fbcf7f…
winner: providerC · settled 34 USD.demo · all 11 privacy invariants hold
```

**Live endpoints:**
| Thing | Where |
|---|---|
| Tacit app (public) | `http://80.225.209.190:3200` (OCI VM, systemd `tacit.service`, mode **devnet**) |
| Devnet Ledger API (5North) | `https://ledger-api.validator.devnet.sandbox.fivenorth.io` (v2 JSON Ledger API) |
| Devnet OAuth token | `https://auth.sandbox.fivenorth.io/application/o/token/` (client-credentials) |
| Seaport deploy UI + our org | `https://app.devnet.seaport.to/tacit` (org "Tacit"; DAR-upload UI) |
| Local Canton 3.x fallback | Splice LocalNet on the VM (`localhost:3975`) — dev/insurance only |

---

## 1. What is REAL vs DEMO/MOCK vs AIMED-FOR  ← read this

### ✅ REAL (on the shared Canton devnet, not faked)
- **The ledger is the real Canton devnet.** 5North's validator is a real participant on the devnet Global Synchronizer (ledger offset ~4.2M — a live shared network). Our contracts are real devnet objects.
- **Privacy is ledger-enforced.** `signatory`/`observer` on the Daml templates; the app's `visibleTo` is **read back from real per-party devnet queries**, never asserted by code.
- **Atomic award + payment.** `Rfs.Award` is one real Daml transaction on devnet: reject losers + accept winner + transfer the IOU + create the Settlement, all-or-nothing.
- **Real contract ids & party ids** (`Tacit43kf…::1220a14ca128…`), our **DAR deployed on devnet**, parties allocated + `CanActAs`-granted on the validator.
- **The e2e privacy proof** asserts loser-blindness, auditor scope, and payment scoping against the live devnet — all pass.
- **MCP agent-to-agent:** an external AI agent (Claude) runs a procurement as **its own devnet party**; its deal is invisible to the default buyer.

### 🟡 DEMO / MOCK / SIMULATED (clearly labeled)
- **The money is a demo voucher, not a stablecoin.** Payment moves a self-issued `USD.demo` IOU (a real ledger contract that really transfers, but a **toy token** — not Canton Coin / a stablecoin). UI says so.
- **The 3 provider agents are app-simulated** bidders (deterministic price model, or an LLM if a key is set). The real-external-agent story is the MCP path.
- **DEMO FALLBACK mode:** if the ledger is unreachable, deals are deterministic in-memory simulations — badge flips to **DEMO FALLBACK**, payment row omitted (never claims value moved).
- **Agent "brains" default to deterministic** (fixed multipliers) unless `GRADIENT_*` is set.

### 🎯 AIMED-FOR
- **Stablecoin / Canton Coin settlement** replacing the demo IOU. **TestNet → MainNet.** Fully **autonomous agents** (provider side too) at scale via MCP.

---

## 2. Architecture

```
Browser ─▶ Next.js app ─▶ [ ledger client facade ] ─▶ Canton participant ─▶ Global Synchronizer
           / and /lens        mode-selected adapter       (v1 or v2 JSON API)

  TACIT_LEDGER_MODE = sandbox        → Adapter A (Daml 2.x v1 HTTP JSON API, dev HS256 JWT)   [offline / DEMO FALLBACK]
                    = canton3-local  → Adapter B (Canton 3.x v2 JSON Ledger API, static token) [LocalNet, dev/insurance]
                    = devnet         → Adapter B (same code, OAuth2 client-credentials)        [LIVE — 5North devnet]
```

The app is a **thin HTTP client of a ledger**; all three modes share the same call sites.

### 2.1 Ledger client (`app/lens/ledger/`)
- **`client.ts`** — facade. Stable surface (`ensureParty`, `create`, `exercise`, `queryAs`, `ledgerReachable`, `ledgerHealth`, `T`, `partyHint`, `PACKAGE_ID`, `LEDGER_MODE_ACTIVE`, `uploadDar`) delegating to the mode-selected adapter. Template ids: sandbox → `<hexid>:Tacit.Sealed:X`; v2 → `#tacit:Tacit.Sealed:X` (package **name**). `ensureParty` returns a **pinned** party id (devnet) before touching the adapter.
- **`adapters/config.ts`** — env → mode/endpoint/auth/package/user/pinned-parties resolution.
- **`adapters/sandboxV1.ts`** — Adapter A: v1 JSON API + HS256 dummy JWT (unchanged original).
- **`adapters/cantonV2.ts`** — Adapter B: v2 JSON Ledger API. OAuth2 client-credentials (cached, refresh-on-401) / static / none. `/v2/commands/submit-and-wait-for-transaction`, `/v2/state/active-contracts`, `/v2/state/ledger-end`, `/v2/parties`, `/v2/packages`, `/v2/users/{id}/rights`. Envelope-agnostic (deep-find) parsing. Grants `CanActAs` on party allocation.
- **`write.ts`** — `settleNegotiation`: ensure parties (incl. Auditor) → create Rfs + 3 SealedBids → snapshot per party → buyer self-issues the IOU → `exercise Rfs.Award` → snapshot settlement + IOU per party.
- **`read.ts`** — `buildLedgerDeal`: per-party snapshots → the `visibleTo`-wrapped `Deal`; surfaces real per-persona **party ids** + the **full settlement contract id**.
- **`economy.ts`** — live economy (provider wealth = IOUs owned; recent settlements).

### 2.2 The four v2 wire facts we reverse-engineered + verified on devnet
Docs' `submit-and-wait` examples get these wrong; all verified against the live validator (`scripts/canton3-smoke.mjs`, `devnet-flow`):
1. **Commands nest** under a `commands` object: `{ commands: { commands:[cmd], commandId, userId, actAs, readAs }, transactionFormat }`.
2. **`userId` must equal the token's user** (v2 is user-based auth; on 5North the token `sub` = `6`).
3. **Template refs use the package NAME** (`#tacit:…`), not the hex id.
4. **Shared validator:** `/v2/parties` GET **503s** (won't list a shared validator's parties) → we **pre-allocate with unique prefixes + pin** the ids; and the submitting user needs **`CanActAs` granted per party** (`POST /v2/users/6/rights`).

---

## 3. The Daml model (`daml/Tacit/Sealed.daml`) — FROZEN

Package name `tacit`. v1 `c0f7a95e…` (SDK 2.10.4). v2 `fdfbfcf0…` (SDK 3.4.11, byte-identical source; **uploaded to devnet**). `daml test`: `test` ok (2 active, 10 tx) + `testAuditor` ok (4 active, 11 tx), identical on both SDKs.

- **`Iou { issuer, owner, amount, currency }`** — `signatory issuer`, `observer owner`; `Transfer` (controller owner). Buyer self-issues `USD.demo`. Auditor is **not** an observer → wealth stays private.
- **`Rfs { rfsId, buyer, description, maxBudget, title, category, auditor:Optional Party }`** — `signatory buyer`, `observer optionalToList auditor`; **`Award(winningBid, losingBids, paymentCid)`** (controller buyer): validate → reject losers → `Accept` winner → consume RFS. One atomic tx.
- **`SealedBid { rfsId, provider, buyer, price }`** — `signatory provider`, **`observer buyer` only** (never auditor — that absence *is* the guarantee); `Accept` (verify IOU → transfer → Settlement) + `Reject`.
- **`Settlement { buyer, provider, rfsId, price, paid, title, category, auditor:Optional Party }`** — `signatory buyer, provider`, `observer optionalToList auditor`; created only inside `Accept`.

Layout: `daml/` (v1, 2.10.4), `daml3/` (v2 templates-only, 3.4.11), `daml3-test/` (v2 `daml test`). Build: `npm run daml:build:v1|v2`, `daml:test:v2`.

---

## 4. App / API (`app/api/`)
- **`negotiate/route.ts`** — POST/GET. Runs a negotiation → if ledger reachable, `settleNegotiation` + `buildLedgerDeal` → `{ transcript, deal, usedLLM, ledger, dealSource }`. Optional validated `{ description, maxBudget, buyerName }`; `buyerName` runs as that Canton party (allocated + granted on devnet).
- **`economy/route.ts`** — GET live economy; `?party=<name>` for a party's own view.
- **`health/route.ts`** — `{ app, status, canton:{ reachable, mode, ledgerUrl, partyCount, error }, packageId }`. Always HTTP 200 when serving (heap ratio is info, not a gate). Drives the badge.

---

## 5. Agents · economy · MCP
- **Agents (`app/lens/agents/`)** — `profiles.ts` (private per-category cost models) + `negotiation.ts` (category inference → one LLM bid per provider w/ ledger balance, price clamp 0.3–0.98×budget; deterministic fallback) + `llm.ts` (`GRADIENT_*`).
- **Economy** — provider wealth on the ledger (IOUs owned); live `/lens` strip + landing stats.
- **MCP server (`mcp/`)** — standalone stdio server, thin API client. Tools: `tacit_health`, `tacit_procure` (settles as the agent's own party), `tacit_my_deals`, `tacit_explain_privacy`.

---

## 6. UI / UX + design system
- **`/lens`** — idle hero → live **NegotiationTheater** (sealed bids → atomic award → payment count-up) → **LensView** reveal. Glass `PersonaSwitcher` across **6 personas** (Public/Buyer/Provider A·B·C/Auditor), blur→sharp refocus on switch. Every field is a `RevealField` (crisp if visible, frosted **PRIVATE** if not, driven only by `visibleTo`). Settlement hero shows "Awarded & paid on Canton", the **full copyable contract id**, a teal **VALUE TRANSFERRED** receipt, and the active persona's **real devnet party id** ("on Canton as `Tacit43kfBuyer::1220a14ca128…`").
- **`/` landing** — 5 beats: Hero · Problem · Mechanic · Proof (`LensPreview`) · Close.
- **Honesty badge (`SourceBadge`)** — **ON CANTON DEVNET / ON CANTON · LOCAL / DEMO FALLBACK**, driven by `/api/health` (probes the ledger), never env alone; devnet-only "Global Synchronizer" chip.
- **Design tokens** — `#FAFAF9` bg, one violet `#7C3AED`, ink `#0A0A0B`; JetBrains Mono + Inter; framer-motion spring physics; CLS ~0; mobile 390px clean; reduced-motion safe.

---

## 7. Deployment (see DEPLOY.md)
- **Devnet (LIVE):** app on the OCI VM (`80.225.209.190`, systemd `tacit.service`, port 3200, bound 0.0.0.0; open OCI ingress TCP 3200 to reach externally). Env in **`~/tacit-devnet.env`** (`chmod 600`, **not in the repo**): mode `devnet`, the 5North Ledger API URL + OAuth (**client id + secret REDACTED — in the 5North access PDF + this private env file, never in the repo**), `TACIT_V2_USER_ID=6`, `TACIT_PACKAGE_ID_V2=fdfbfcf0…`, and `TACIT_PARTIES_JSON` pinning `Buyer/ProviderA/B/C/Auditor → Tacit43kf…::1220a14ca128…`. Token TTL 8h; adapter auto-refreshes on 401.
- **Bootstrap (idempotent-ish):** `scripts/devnet-bootstrap.mjs` — token → upload DAR (skip if present) → allocate 5 parties (unique prefix) → grant `CanActAs` to user 6 → print `TACIT_PARTIES_JSON`.
- **Deploy our DAR:** already on devnet via the bootstrap's `/v2/packages` upload (or the Seaport "Upload DAR to Validator" UI in the "Tacit" org).
- **LocalNet (fallback/dev):** `~/tacit-validator/splice-node/docker-compose/localnet` (SV + app-provider), participant JSON API `localhost:3975`, static HS256 unsafe token — kept as insurance.

---

## 8. Environment variables
| Var | Meaning |
|---|---|
| `TACIT_LEDGER_MODE` | `sandbox` / `canton3-local` / `devnet` |
| `TACIT_V2_API_URL` | v2 participant JSON API (devnet: 5North; local: `localhost:3975`) |
| `TACIT_V2_AUTH` | `none` / `static` / `oauth` (devnet = oauth) |
| `TACIT_DEVNET_TOKEN_URL / _CLIENT_ID / _CLIENT_SECRET / _AUDIENCE / _SCOPE` | OAuth2 client-credentials (5North) |
| `TACIT_V2_STATIC_TOKEN` | LocalNet unsafe HS256 token |
| `TACIT_V2_USER_ID` | ledger-api user the app submits as (devnet `6`) |
| `TACIT_PACKAGE_ID_V2` (`fdfbfcf0…`), `TACIT_PACKAGE_NAME_V2` (`tacit`) | v2 templates |
| `TACIT_PARTIES_JSON` | pinned `hint→partyId` map (shared validator) |
| `TACIT_PARTY_PREFIX` | unique allocation prefix (bootstrap) |
| `DAML_JSON_API_URL / DAML_LEDGER_ID / DAML_TOKEN_SECRET / TACIT_PACKAGE_ID` | sandbox (v1) |
| `NEXT_PUBLIC_APP_URL` | public base URL for OG (build-time) |
| `GRADIENT_*` | optional LLM for agent bidding |

---

## 9. Verification & proof scripts
- **`scripts/preflight-e2e.mjs`** (`npm run preflight:e2e -- --require-ledger`) — full deal + all privacy invariants + pasteable EVIDENCE block. **Passing live on devnet** (evidence in §0).
- **`scripts/canton3-smoke.mjs`** — raw v2 wire shapes (create/exercise/query/visibility) against a participant. Locked the adapter.
- **`scripts/devnet-bootstrap.mjs`** — token → DAR upload → allocate + grant → pin.
- **`scripts/preflight.mjs`** — app up + PAYMENT VERIFIED on ledger deals.
- **`scripts/canton3-local.sh`** — local Canton 3.x participant launcher.
- Builds: `npm run build` + `npx tsc --noEmit` green (app + mcp).

---

## 10. What's left (deadline sprint)
1. **Confirm the public VM URL on devnet** (build/switch completing) + one warm run.
2. **Judge-first README** (what / why Canton / proof-it's-live / how-to-verify) + SPEC amendment.
3. **3-min video** — `DEMO_SCRIPT.md` ready (update the honesty column: we're on real **devnet**, not local).
4. **Final builds green** + dress rehearsal + submit.
5. (Post-submission roadmap) stablecoin/Canton Coin, TestNet/MainNet, autonomous agents.

---

## 11. Decision log (condensed)
- `2026-06-21 → 07-05` — Pivoted onto Canton → Tacit. Agent engine + live `/lens`; local Canton write + per-party reads; atomic award; ON CANTON/DEMO FALLBACK labeling, `/api/health`, preflight. **Pass 1** cinematic `/lens`; **P2.1** atomic IOU payment; **Pass 3** landing; **Pass 4** MCP; **Pass 5** real agent economy; **Pass 6** Auditor + on-ledger titles (`c0f7a95e…` frozen); **Pass 7** refinement.
- `2026-07-11` — **Pass 8 (GO LIVE ON CANTON DEVNET):** mode-selected ledger adapter (sandbox/canton3-local/devnet); **verbatim Daml 3.4.11 recompile** → `fdfbfcf0…` (`daml test` green); stood up Splice **LocalNet** on the OCI VM and proved the full flow on real Canton 3.x; then discovered **5North's hosted devnet validator** (Seaport PDF) → OAuth2 m2m access to the shared devnet v2 JSON Ledger API. **Uploaded our DAR to devnet, allocated + granted parties, pinned them, and the full app + e2e privacy proof pass on the real shared Canton devnet.** Fixed 4 v2 wire quirks; 3-state honesty badge + real party-id reveal + full copyable contract id; scripts (`devnet-bootstrap`, `preflight-e2e`, `canton3-smoke`, `canton3-local.sh`), `DEPLOY.md`, `DEMO_SCRIPT.md`, `.env.example`; app live on the VM via systemd in **devnet** mode. Secret kept out of the repo.
