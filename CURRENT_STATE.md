# TACIT — Current State

> **Tacit** — *the private economy for AI agents.* Private agent-to-agent commerce on **Canton**: agents negotiate via **sealed bids**, the buyer awards atomically through a Daml choice, and **the ledger itself** controls who can see what.
>
> Operational status (what's done, how it works, how to run it). The locked product definition is in **[SPEC.md](SPEC.md)**. Last updated: **2026-06-29**. Repo: https://github.com/shariqazeem/tacit

---

## ⚡ TL;DR
The full loop is **built, working, live on a local Canton ledger, and the repo is now 100% Tacit** (all ParallaxPay legacy removed):

> A buyer agent posts a request → three provider agents submit **sealed bids** → the buyer **awards the lowest via `Rfs.Award`** (one Daml transaction: losers archived, `Settlement` created, RFS closed) → the **Ledger Lens** lets you switch perspective and see the privacy is **enforced by the ledger**, with a **real Canton settlement contract id** on screen.

What's left is *packaging + expanding*: a hosted deploy (live link), a 3-min video, and the roadmap in [SPEC.md §8](SPEC.md) (payment IOU, MCP, auditor persona).

---

## 1. Status at a glance

| Phase | What | State |
|---|---|---|
| **P0 · P1a** | Ledger Lens UI + real Daml sealed-bid proof | ✅ committed |
| **P4.1 · P4.2** | Agent negotiation engine + live `/lens` experience | ✅ committed |
| **P3.0–P3.2** | Local Canton ledger + JSON API; route **writes** then **reads back** per-party | ✅ committed |
| **P2** | **Atomic award** — `Rfs.Award` archives losers + creates `Settlement` + closes RFS in one tx | ✅ committed |
| **P3 (reliability)** | 20s timeout · honest ON CANTON / DEMO FALLBACK labeling · `/api/health` · `preflight` | ✅ committed |
| **Pivot** | **Removed all ParallaxPay legacy — repo is 100% Tacit**; runs on plain `next dev`/`next start` | ✅ committed `6fd678c`, pushed |
| **Deploy · Video** | Live product link (VM, production build) + 3-min video | ⬜ next |
| **P2.1 · MCP · Auditor** | Roadmap ([SPEC §8](SPEC.md)) | ⬜ |

Everything is pushed to **github.com/shariqazeem/tacit** (`main`).

---

## 2. How it works (end-to-end)

```
Browser (/lens)                 Next.js (:3100)                        Canton sandbox (:6865) + JSON API (:7575)
──────────────                  ───────────────                        ─────────────────────────────────────────
idle hero ─ click ▶ ─▶ POST /api/negotiate ─▶ negotiateCore()   (buyer posts RFS; 3 providers price; buyer picks lowest)
                                              │ ledgerReachable()? yes
                                              ▼ settleNegotiation(core):
                                                ensureParty ×4 · create Rfs(rfsId) · create SealedBid ×3
                                                SNAPSHOT bids per party (while active)
                                                exercise Rfs.Award ─────▶ ONE tx: Reject losers + Accept winner (→Settlement) + close RFS
                                                SNAPSHOT settlement per party
                                              ▼ buildLedgerDeal(core, snapshot)   (visibleTo derived from the snapshots)
  ◀── { transcript, deal, dealSource:'ledger', ledger:{contracts.settlement} } ──┘
  ▼ NegotiationTheater → LensView renders the ledger-derived deal (switch persona → ledger-enforced privacy)
```

If the ledger is unreachable, the route returns a **clearly-labeled** in-memory fallback (`dealSource:'memory'`, **DEMO FALLBACK** badge).

---

## 3. Technical backend

### 3.1 Daml (`daml/`) — package `66e7ac22…`, SDK 2.10.4
- `Rfs { rfsId, buyer, description, maxBudget }` — `signatory buyer`; **`Award`** choice (controller buyer, consuming): validate winner → Reject losers → Accept winner → consume RFS.
- `SealedBid { rfsId, provider, buyer, price }` — `signatory provider`, **`observer buyer`**; buyer-controlled **`Accept`** (creates `Settlement`) and **`Reject`** (archives).
- `Settlement { buyer, provider, rfsId, price }` — `signatory buyer, provider`, created only inside `Accept`.
- **Proof** (`Tacit/Test.daml`): `daml test` → **ok (1 active contract, 7 transactions)** — privacy + atomic award + over-budget reject + settlement visible only to buyer + winner + bids/RFS archived.

### 3.2 Ledger integration (`app/lens/ledger/`)
- `client.ts` — JSON API client: dev JWTs, `ensureParty`, `create`, `exercise`, `queryAs`, `ledgerReachable`, `ledgerHealth`; exports `LEDGER_URL`, `PACKAGE_ID`, `PACKAGE_ID_FROM_ENV`; **20s** per-call timeout; warns if `TACIT_PACKAGE_ID` unset. Env-overridable.
- `write.ts` — `settleNegotiation(core)`: create Rfs+bids → snapshot bids (before award) → `exercise Rfs.Award` → snapshot settlement.
- `read.ts` — `buildLedgerDeal(core, snapshot)` (pure): `visibleTo` from the per-party snapshots; status "Awarded on Canton"; real settlement contract id.

### 3.3 Canton local-dev recipe
Sandbox `:6865` + JSON API `:7575` (bundled, no Docker/VM). Dev JWT (HS256, `--allow-insecure-tokens`); **`ledgerId:"sandbox"` required for `/v1/create` + `/v1/exercise`** (party mgmt doesn't). Party ids `<Hint>::1220e232…`, idempotent `ensureParty`. Real-time reads (no PQS lag).

### 3.4 Agents (`app/lens/agents/`)
`negotiation.ts` — `negotiateCore` (buyer + 3 provider agents → raw outcome + transcript), `buildDealFromCore` (in-memory fallback, honest copy), `runNegotiation`. `llm.ts` — OpenAI-compatible (Gradient env), null-safe; deterministic fallback (budget $50 → 31/42/28, winner C). Never hangs.

### 3.5 API (`app/api/`)
- `negotiate/route.ts` — `negotiateCore` → if reachable: `settleNegotiation` + `buildLedgerDeal` → `{ transcript, deal, usedLLM, ledger, dealSource }`.
- `health/route.ts` — `{ app, status, memory, canton:{reachable, ledgerUrl, error}, packageId:{short, fromEnv, warning} }`; no secrets; Canton-down does not 503.

---

## 4. Frontend — UI/UX (`app/lens/`)
Three-phase machine in `LensExperience.tsx` (LensView untouched): **idle hero → live theater (`NegotiationTheater`) → reveal (`LensView`)**. Fixed top-right control: **↻ Replay** + a source badge **ON CANTON** (teal, live ledger) / **DEMO FALLBACK** (amber, in-memory).

**The Ledger Lens** (`LensView.tsx`): `PersonaSwitcher` (Public · Buyer · Provider A/B/C) + three cards (**The Request** · **Sealed Bids** · **Atomic Settlement** with status "Awarded on Canton" + real **Settlement contract** id). Footer is **honest per mode** (ledger vs "Demo fallback · deterministic simulation…"). Each field is a `RevealField` — crisp value if visible, frosted `🔒 PRIVATE` if not; visibility comes **only** from `visibleTo` (ledger-derived).

**Visual system:** `#FAFAF9` bg, white cards, violet `#7C3AED`, ink `#0A0A0B`, JetBrains Mono for data, Inter for prose. `HideAppChrome` hides the Next dev indicator on `/lens` only. *(Full design spec locked in [SPEC.md §7](SPEC.md).)*

---

## 5. File map (the entire repo — 100% Tacit)
```
app/
  layout.tsx                minimal root (no wallet/startup providers)
  page.tsx                  redirects / → /lens
  globals.css               fonts (JetBrains Mono/Inter) + Tailwind theme
  api/
    negotiate/route.ts      negotiate → settle on Canton → JSON (dealSource)
    health/route.ts         reachability + package id (no secrets)
  lens/
    page.tsx · types.ts · dataSource.ts (seed, honest sample copy)
    components/ LensExperience · NegotiationTheater · LensView · RevealField · PersonaSwitcher · HideAppChrome
    agents/    negotiation.ts · llm.ts
    ledger/    client.ts · write.ts (settleNegotiation) · read.ts (buildLedgerDeal)
daml/Tacit/   Sealed.daml (Rfs+Award · SealedBid+Accept/Reject · Settlement) · Test.daml
scripts/preflight.mjs        npm run preflight
SPEC.md · CURRENT_STATE.md · README.md · PROMPT_ENGINEER_BRIEF.md
next.config.ts · package.json · tsconfig.json · tailwind.config.js · postcss.config.mjs
```
No custom server, no middleware, no Docker/DB/wallet — just Next.js + Daml.

---

## 6. How to run it
**Prereqs:** JDK 17, Daml SDK 2.10.4, Node + `npm install`.
```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
cd daml && daml build && cd ..                                                   # → daml/.daml/dist/tacit-0.1.0.dar
daml sandbox --dar daml/.daml/dist/tacit-0.1.0.dar --port 6865 --port-file /tmp/sandbox-port.txt --wall-clock-time &
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens &
PORT=3100 npm run dev                                                            # open http://localhost:3100  (→ /lens)
APP_URL=http://localhost:3100 npm run preflight                                  # smoke test: expect LEDGER-backed
```
> **Rebuilt the DAR?** The package id changes — `daml ledger upload-dar --host localhost --port 6865 daml/.daml/dist/tacit-0.1.0.dar` (or restart the sandbox with `--dar`) and set **`TACIT_PACKAGE_ID=<new id>`**. Built-in default: `66e7ac22…`. `/api/health` shows the short id + `fromEnv`.

**For the live link / recording: use a production build** — `npm run build && PORT=3100 npm start`. It removes the ~60s dev cold-compile that causes first-request latency, and drops the dev indicator.

### 🎬 Demo recording checklist
1. Ledger + app up; **warm `/lens`** once (production build avoids the cold compile).
2. `npm run preflight` → confirm **LEDGER-backed** + a real settlement contract id.
3. `/lens` → **▶ Run live negotiation** → reveal. Confirm the **ON CANTON** badge + real contract id.
4. Switch **Buyer → Provider A → Public**: buyer sees all; Provider A sees only its own $31, competitors frosted; public sees nothing private.
5. (Optional) Stop the ledger, re-run → honest **DEMO FALLBACK** label.

---

## 7. What's verified (post-pivot)
- `next build` ✅ · `tsc --noEmit` ✅ **0 errors** · `daml build` ✅ · `daml test` ✅ (ok, 1 active, 7 tx).
- `/` → **307 → /lens** ✅ · `/lens` → 200, **SSRs its content** ✅ · `/api/health` ✅ (canton reachable).
- `npm run preflight` ✅ **LEDGER-backed** (e.g. settlement `00311fa14670…`).
- Repo: 1633 legacy deps removed; routes are exactly `/ · /lens · /api/negotiate · /api/health`.

---

## 8. Known gaps & notes
1. **No money movement yet** — the *award* is atomic, but no payment token transfers. UI copy is honest. Fix = **P2.1** ([SPEC §8](SPEC.md)).
2. `TACIT_PACKAGE_ID` default is hardcoded; set the env after a DAR rebuild (`/api/health` + a startup warning flag it).
3. **Dev cold-compile latency** — the first `/api/negotiate` on `next dev` can be slow; use a **production build** for the live link/recording.
4. **This dev machine is memory-pressured** (multiple JVMs) — an environmental issue, not the code; a VM with headroom + a process manager fixes it. `preflight` is the guard.

---

## 9. What's left → see [SPEC.md §8](SPEC.md)
Ordered: **P2.1 payment IOU** → **MCP** (the differentiator) → **auditor persona** → **Tacit landing** → **production deploy (live link)** → **3-min video**.

---

## 10. Decision log
- `2026-06-21` — Chose the Canton hackathon; pivoted the ParallaxPay agent engine onto Canton → **Tacit**. Fresh repo. Demo-first (P0 Lens, P1a Daml proof).
- `~06-22..26` — Agent engine (P4.1) + live `/lens` (P4.2); local Canton write (P3.1) + per-party reads (P3.2). Light-theme override; no-mocks via the `getDeal()` seam. Architecture: **Next.js → JSON Ledger API direct**; local sandbox over LocalNet.
- `2026-06-26` — **P2:** atomic award via `Rfs.Award`. **P3 reliability:** 20s timeout, ON CANTON/DEMO FALLBACK labeling, `/api/health`, `preflight`.
- `2026-06-29` — **Checkpoint 2 submitted.** Pushed to a new public repo **github.com/shariqazeem/tacit** (scrubbed `parallaxpay_x402`). **Full pivot:** deleted all ParallaxPay legacy (~1633 deps, all legacy dirs/routes/server/middleware); repo is 100% Tacit; runs on plain `next dev`/`next start`; `/` → `/lens`. Locked the product definition in **SPEC.md**.
