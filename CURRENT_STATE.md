# TACIT — Current State

> **Tacit** — *the private economy for AI agents.* A private agent-to-agent commerce layer on **Canton**: AI agents negotiate via **sealed bids**, the buyer **awards atomically through a Daml choice**, and **the ledger itself** controls who can see what.
>
> Last updated: **2026-06-26**. Single source of truth for what exists today. Companion: [PROMPT_ENGINEER_BRIEF.md](PROMPT_ENGINEER_BRIEF.md).

---

## ⚡ TL;DR
The full demo loop is **built, working, and live on a local Canton ledger** (no Docker, no VM), with a **real atomic award** and a reliable, honest demo path:

> A buyer agent posts a request → three provider agents submit **sealed bids** → the buyer **awards the lowest via `Rfs.Award`** (one Daml transaction: losers archived, `Settlement` created, RFS closed) → the **Ledger Lens** lets you switch perspective (Public / Buyer / Provider A·B·C) and see the privacy is **enforced by the ledger**, with a **real Canton contract id** on screen.

**P2 (atomic award)** and **P3 (demo reliability)** are done. What's left is *packaging to win*: a hosted deploy (live link), a deck, and a 3-minute video. See [§9](#9-whats-left).

---

## 1. Status at a glance

| Phase | What | State |
|---|---|---|
| **P0** | Ledger Lens UI (perspective-switching privacy view) | ✅ committed |
| **P1a** | Real Daml sealed-bid proof (`daml test`) | ✅ committed |
| **P4.1 / P4.2** | Agent negotiation engine + live `/lens` experience | ✅ committed |
| **P3.0–P3.2** | Local Canton ledger + JSON API; route **writes** then **reads back** per-party | ✅ committed |
| **P2** | **Atomic award** — `Rfs.Award` archives losers + creates `Settlement` + closes RFS in **one tx** | ✅ committed `08ffea7` |
| **P3 (reliability)** | 20s JSON-API timeout · honest ledger/fallback labeling · `/api/health` · `npm run preflight` | ✅ done |
| **Deploy** | Hosted live product link (VM) | ⬜ blocked on VM (“soon”) — *recommended next* |
| **Deck / Video** | Submission artifacts | ⬜ not started |
| **MCP / Auditor persona / payment IOU (P2.1)** | Optional ceiling-raisers | ⬜ not started |

---

## 2. How it works (end-to-end request flow)

```
Browser (/lens)                 Next.js server (:3100)                 Canton sandbox (:6865) + JSON API (:7575)
──────────────                  ─────────────────────                 ─────────────────────────────────────────
IdleHero ─ click ▶ ─▶ POST /api/negotiate ─▶ negotiateCore()  (buyer posts RFS; 3 providers price; buyer picks lowest)
                                              │
                                            ledgerReachable()? ──────────▶ GET /livez
                                              │ yes
                                              ▼
                                            settleNegotiation(core):
                                              ensureParty ×4 ───────────▶ allocate/reuse
                                              create Rfs(rfsId) ────────▶ (as buyer)
                                              create SealedBid ×3 ──────▶ (each provider, observer = buyer)
                                              SNAPSHOT bids per party ──▶ query SealedBid AS each party (bids still active)
                                              exercise Rfs.Award ───────▶ ONE tx: Reject losers + Accept winner
                                                                          (→ Settlement) + consume Rfs
                                              SNAPSHOT settlement ──────▶ query Settlement AS each party
                                              ▼
                                            buildLedgerDeal(core, snapshot)   (pure: visibleTo from the snapshots)
                                              ▼
  ◀── { transcript, deal, dealSource:'ledger', ledger:{contracts.settlement} } ──┘
  ▼
NegotiationTheater plays transcript ─▶ LensView renders the ledger-derived deal (switch persona → ledger-enforced privacy)
```

**Key idea:** the Lens does **not** assert who-sees-what. The server snapshots each party's view of the sealed bids *while they're active*, then the atomic award archives them; the Lens reflects those snapshots. If the ledger is unreachable, the route returns a **clearly-labeled** in-memory fallback (`dealSource:'memory'`).

---

## 3. Technical backend

### 3.1 Daml layer (`daml/`) — the moat + the atomic award
- **SDK:** Daml **2.10.4**. Package id `66e7ac22bcf8dce96c8449b584b85ba19e4dd03c48211b1d5990e0ceb3af5e04`. Artifact `daml/.daml/dist/tacit-0.1.0.dar`. *(Changes on every rebuild — see §6.)*
- **Contracts** (`daml/Tacit/Sealed.daml`):
  - `Rfs { rfsId, buyer, description, maxBudget }` — `signatory buyer`. Choice **`Award`** (controller buyer, consuming): validates winner (right RFS, right buyer, within budget) → `Reject`s every losing bid → `Accept`s the winner → consumes the RFS. One transaction.
  - `SealedBid { rfsId, provider, buyer, price }` — `signatory provider`, **`observer buyer`** (only buyer). Buyer-controlled choices: **`Accept`** (consuming; creates the dual-signatory `Settlement` using the bid's provider authority) and **`Reject`** (consuming; archives a losing bid).
  - `Settlement { buyer, provider, rfsId, price }` — `signatory buyer, provider`. Created **only** inside `Accept`, never as a standalone create.
- **Why atomic & authorized:** a provider, by creating a `SealedBid`, pre-authorizes the buyer-controlled `Accept`/`Reject`. Inside `Accept` the body holds *both* provider and buyer authority — enough to create `Settlement`. `Award` does it all in one tx → all-or-nothing.
- **Proof** (`daml/Tacit/Test.daml`): `daml test` → **ok (1 active contract, 7 transactions)** — proves sealed-bid privacy, atomic award, over-budget rejection, settlement visible only to buyer + winner, and bids/RFS archived after award.

### 3.2 Ledger integration (`app/lens/ledger/`) — server-side, over the JSON Ledger API
- `client.ts` — JSON API client: dev **JWTs** (HS256, dummy secret), `ensureParty`, `create`, **`exercise`**, `queryAs`, `ledgerReachable`, **`ledgerHealth`**. Exports `LEDGER_URL`, `PACKAGE_ID`, `PACKAGE_ID_FROM_ENV`. **Per-call timeout = 20s** (bumped from 10s for slow/cold machines). Warns at startup if `TACIT_PACKAGE_ID` is unset. Env-overridable (`DAML_JSON_API_URL`, `DAML_LEDGER_ID`, `DAML_APPLICATION_ID`, `DAML_TOKEN_SECRET`, `TACIT_PACKAGE_ID`).
- `write.ts` — **`settleNegotiation(core)`**: ensure parties → create `Rfs`+3 `SealedBid` → **snapshot bid visibility per party (before award)** → **`exercise Rfs.Award`** → snapshot settlement per party. Returns `{ refs, snapshot }`. Caught errors → `{ written:false }`.
- `read.ts` — **`buildLedgerDeal(core, snapshot)`** (pure): derives each bid's `visibleTo` from the per-party snapshot, sets the status to **“Awarded on Canton”**, and surfaces the real `Settlement` contract id.

### 3.3 The Canton local-dev recipe (hard-won)
- **Stack (no Docker/VM):** Canton **sandbox** `:6865`, **JSON Ledger API** `:7575`, both bundled in the SDK. JDK 17.
- **Auth:** dev JWT, HS256, dummy secret (sandbox runs `--allow-insecure-tokens`). Claim `https://daml.com/ledger-api` with `applicationId`, `actAs`/`readAs` (or `admin:true`), `exp`.
- **Gotcha:** `/v1/create` and `/v1/exercise` **require `ledgerId:"sandbox"`** in the token; `/v1/parties` doesn't. Omitting it = 401.
- **Party ids:** `<Hint>::1220e232…`. `ensureParty` is idempotent. JSON API is real-time (no PQS lag).

### 3.4 Agent engine (`app/lens/agents/`)
- `negotiation.ts` — `negotiateCore` runs buyer + 3 provider agents → raw outcome + transcript; `buildDealFromCore` = the **in-memory fallback** deal (now honest copy: “Simulated award”, “ledger offline”).
- Providers price via LLM (`llm.ts`, Gradient env) **or** a deterministic fallback (budget $50 → 31/42/28, winner C). Never hangs.

### 3.5 API (`app/api/`)
- `negotiate/route.ts` — `negotiateCore` → if `ledgerReachable()`: `settleNegotiation` then `buildLedgerDeal` → `{ transcript, deal, usedLLM, ledger, dealSource }` (`dealSource: 'ledger' | 'memory'`). Falls back to the in-memory deal otherwise.
- `health/route.ts` — container memory/uptime **plus** `{ app, canton:{reachable, ledgerUrl, error}, packageId:{short, fromEnv, warning} }`. No secrets. Canton-down does **not** 503 (the app runs in fallback).

---

## 4. Frontend — UI/UX (`app/lens/`)

### 4.1 The experience (`/lens`)
Three-phase machine in `LensExperience.tsx` (`LensView` untouched): **idle hero** → **live theater** (`NegotiationTheater.tsx`) → **reveal** (`LensView.tsx`). The fixed top-right control shows **↻ Replay negotiation** and a **source badge**: **`ON CANTON`** (teal) when the deal came from the live ledger, **`DEMO FALLBACK`** (amber) when in-memory.

### 4.2 The Ledger Lens (`LensView.tsx`)
- **PersonaSwitcher** (sliding violet pill): Public · Buyer Agent · Provider A · B · C.
- Cards: **The Request** · **Sealed Bids** (3 rows) · **Atomic Settlement** (status “Awarded on Canton”, **Settlement contract = real Canton contract id**, winner, amount). Subtitle: *“Awarded by a Daml choice — losing bids closed and the settlement created in one Canton transaction.”*
- Footer is **honest per mode**: ledger → *“Live on Canton · visibility enforced by the ledger · award executed by a Daml choice”*; fallback → *“Demo fallback · deterministic simulation · start the Canton ledger for the live privacy proof.”*
- Each field is a **`RevealField`**: visible → crisp value (JetBrains Mono for data); hidden → frosted `🔒 PRIVATE` pill. Visibility comes **only** from `visibleTo` (ledger-derived).

### 4.3 Visual system (premium light / institutional)
Background `#FAFAF9`, white cards, hairline `rgba(0,0,0,0.06)`, violet accent `#7C3AED`, ink `#0A0A0B`, JetBrains Mono for data. `HideAppChrome` hides the Next dev indicator on `/lens` only.

---

## 5. File map (Tacit-specific)
```
daml/Tacit/Sealed.daml      Rfs(+Award) · SealedBid(+Accept/Reject, observer buyer) · Settlement · rejectLosing
daml/Tacit/Test.daml        Daml Script: privacy + atomic award proof
app/api/negotiate/route.ts  POST/GET → settleNegotiation → buildLedgerDeal → JSON (dealSource)
app/api/health/route.ts     memory/uptime + canton reachability + package id (no secrets)
app/lens/
  page.tsx · types.ts · dataSource.ts (seed; honest sample copy)
  components/ LensExperience(source badge) · NegotiationTheater · LensView(honest footer) · RevealField · PersonaSwitcher · HideAppChrome
  agents/    negotiation.ts (negotiateCore/buildDealFromCore) · llm.ts
  ledger/    client.ts(+exercise,+ledgerHealth,20s) · write.ts(settleNegotiation) · read.ts(buildLedgerDeal)
scripts/preflight.mjs        npm run preflight  (health + negotiate smoke test)
```

---

## 6. How to run it locally

**Prereqs:** JDK 17, Daml SDK 2.10.4, Node + `npm install`.
```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
```
1. **Build the DAR:** `cd daml && daml build` → `daml/.daml/dist/tacit-0.1.0.dar`
2. **Ledger:** `daml sandbox --dar daml/.daml/dist/tacit-0.1.0.dar --port 6865 --port-file /tmp/sandbox-port.txt --wall-clock-time`
3. **JSON API:** `daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens`
4. **App:** `PORT=3100 NODE_ENV=development npm run dev` → open **http://localhost:3100/lens**, click ▶
5. **Preflight:** `APP_URL=http://localhost:3100 npm run preflight` → checks `/api/health` + `/api/negotiate`, prints **ledger-backed vs fallback** + the settlement contract id. Exits non-zero only if the app is unreachable / shape is broken; **warns** (not fails) on fallback.

> **Rebuilt the DAR?** Its package id changes. Either `daml ledger upload-dar --host localhost --port 6865 daml/.daml/dist/tacit-0.1.0.dar` on the running sandbox (or restart it with `--dar`), and set **`TACIT_PACKAGE_ID=<new id>`** (`daml damlc inspect-dar --json <dar> | .main_package_id`). `/api/health` shows the package short id + `fromEnv`. Built-in default: `66e7ac22…`.

**Env (optional):** `GRADIENT_API_KEY` (+`GRADIENT_MODEL`,`GRADIENT_BASE_URL`) → real-LLM bids. `DAML_JSON_API_URL` / `DAML_LEDGER_ID` for the VM.

### 🎬 Demo recording checklist
1. Start ledger + JSON API + app; **warm `/lens`** (load once, click ▶ once — the first compile is slow).
2. `npm run preflight` → confirm **`LEDGER-backed`** + a real settlement contract id.
3. `/lens` → **▶ Run live negotiation** → wait for the reveal.
4. Confirm the **ON CANTON** badge + the **real settlement contract id** in the Atomic Settlement card.
5. Switch **Buyer → Provider A → Public**: buyer sees all bids; Provider A sees only its own ($31), competitors frosted; public sees nothing private.
6. (Optional) Stop the ledger, re-run → show the honest **DEMO FALLBACK** label, proving the live path is the real one.

---

## 7. What's verified
- **Daml:** `daml build` ✅; `daml test` ✅ ok (1 active contract, 7 transactions) — privacy + atomic award + over-budget reject + settlement visible only to buyer+winner + bids/RFS archived.
- **`npx tsc --noEmit`** ✅ clean.
- **`/api/negotiate`** ✅ `dealSource:'ledger'`, real settlement cid; independent post-award ledger query: `sealedBids(buyer)=0`, `settlement(buyer)=1`, `settlement(winner)=1`, `settlement(loser)=0`.
- **`/lens`** (headless) ✅ renders + reveals a real Canton contract id; Provider A sees only its own bid; honest copy; light theme intact.

---

## 8. Known gaps & integrity flags
1. **No money movement yet (the one honest gap).** The **award** is atomic (losers archived + `Settlement` created + RFS closed in one tx), but no payment token/escrow is transferred. UI copy is honest (“Awarded on Canton”, “award executed by a Daml choice”). Optional **P2.1**: create/transfer a demo IOU inside `Accept`.
2. ✅ Resolved: fallback/seed copy no longer overclaims (“Simulated award” / “Sample deal” / honest footer), and a **ON CANTON / DEMO FALLBACK** badge labels the source.
3. `TACIT_PACKAGE_ID` default is hardcoded (`66e7ac22…`); set the env after a DAR rebuild — `/api/health` + a startup warning flag this.
4. `/api/negotiate` is dev-bypassed by the x402 middleware; for prod, exclude it from the payment matcher (a frozen file — handle at deploy).
5. **Cold-start latency:** the first `/api/negotiate` after a code change can take ~60s (Next compile) on a loaded machine. Pre-warm `/lens` and run `preflight` before recording.
6. Contracts accumulate across runs (unique `rfsId` per run); fine for demo.

---

## 9. What's left (to win)
- ✅ **P2 (atomic award)** and ✅ **P3 (reliability)** — done.
- **Deploy to the VM → the required live product link.** *Recommended next.* The sandbox stack runs on the VM (~8 GB for the JVM); set `TACIT_PACKAGE_ID` + `DAML_JSON_API_URL`; run `npm run preflight` as the smoke test.
- **Deck + 3-minute video** — recordable now (the spine is real + atomic).
- **Optional:** payment IOU (P2.1), MCP differentiator, auditor/regulator persona.

---

## 10. Decision log
- `2026-06-21` — Chose the Canton hackathon; pivoted ParallaxPay's agent engine onto Canton. Rejected invoice-financing. Chose **private agent-to-agent commerce = Tacit**. Fresh repo.
- `2026-06-21` — Demo-first: Ledger Lens (P0) + Daml sealed-bid proof (P1a).
- `~06-22..23` — Agent engine (P4.1) + live `/lens` (P4.2).
- `~06-23..26` — **Light theme** override; **no-mocks** via a swappable `getDeal()` seam; stood up local Canton (P3.0), writes (P3.1), per-party reads (P3.2). Architecture: **Next.js → JSON Ledger API directly**; local sandbox over LocalNet.
- `2026-06-26` — **P2 (`08ffea7`):** atomic award via `Rfs.Award` (Reject losers, Accept winner → `Settlement`, consume RFS). Route exercises `Award`; bid visibility snapshotted before the award (which archives the bids). `daml test` proves privacy + atomicity + over-budget reject + settlement visibility.
- `2026-06-26` — **P3 (reliability):** JSON-API timeout 10s→20s; honest fallback/seed copy + **ON CANTON / DEMO FALLBACK** badge; `/api/health` (Canton reachability + package id, no secrets); `scripts/preflight.mjs` + `npm run preflight`; `TACIT_PACKAGE_ID` warning when using the default.
