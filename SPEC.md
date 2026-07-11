# Tacit — Product Spec (LOCKED)

> The definitive specification of **what we are building**. Decisions here are **locked** — build to this spec; don't re-litigate them. Live operational status (what's done, how to run it) lives in **[CURRENT_STATE.md](CURRENT_STATE.md)**.
>
> Repo: https://github.com/shariqazeem/tacit · Last locked: 2026-06-29

---

## 0. One-liner
**Tacit is the private economy for AI agents** — private agent-to-agent commerce on **Canton**, where the ledger itself enforces who can see what.

## 1. Thesis (locked)
- AI agents are becoming economic actors: they will buy data, compute, and services from one another at scale.
- On a transparent chain, every agent transaction broadcasts your **prices, counterparties, and margins** to competitors — a non-starter for any serious business.
- **Canton is the only L1 where agent commerce can be both confidential *and* atomic.**
- Tacit is the **private settlement layer for the agent economy.** The moat is **load-bearing privacy**: sealed-bid negotiation that competitors cannot see, plus atomic Daml settlement. Without that, it's just "agents pay each other" — which any chain does.

## 2. The core mechanic (locked)
Sealed-bid procurement between agents:
1. A **buyer agent** posts a Request-for-Service (RFS) with a budget.
2. **Provider agents** submit **sealed bids** — each price visible only to that provider and the buyer.
3. The buyer **awards the lowest** bid via **one atomic Daml transaction**: reject the losers, accept the winner (creating the settlement), close the RFS.
4. The **Ledger Lens** shows the same deal from each perspective; visibility is **read back from the live ledger**.

## 3. Privacy model — the moat (locked, non-negotiable)
- Privacy is enforced by **Canton/Daml's signatory/observer model — never by application code.**
- `SealedBid`: `signatory provider`, `observer buyer` (**and only buyer**). Competing providers are not stakeholders, so the ledger **never returns the contract to them.**
- The award is **atomic**: a single Daml transaction, all-or-nothing, guaranteed by the ledger.
- The Lens **derives** each field's `visibleTo` from **actual per-party ledger queries** — it *reflects* the ledger, never *asserts* privacy.
- **INVARIANT:** no code path may reveal a sealed price to a non-stakeholder, and the demo must always be able to **prove this live** (query as each party → provider sees only its own bid).

## 4. Domain model (Daml — locked for v1)
`daml/Tacit/Sealed.daml`:
- `Rfs { rfsId, buyer, description, maxBudget }` — `signatory buyer`.
  - `choice Award(winningBid, losingBids)` — controller buyer, consuming. Validates (right RFS, right buyer, within budget) → `Reject`s losers → `Accept`s winner → consumes the RFS (no double-award).
- `SealedBid { rfsId, provider, buyer, price }` — `signatory provider`, `observer buyer`.
  - `choice Accept` (consuming, controller buyer) → creates `Settlement` (has provider authority via the bid's signatory).
  - `choice Reject` (consuming, controller buyer) → archives a losing bid.
- `Settlement { buyer, provider, rfsId, price }` — `signatory buyer, provider`. **Created only inside `Accept`**, never as a standalone create.
- **Extension points (must stay additive — do not reshape the templates):** a `reputation` snapshot on `SealedBid`; a payment token transferred inside `Accept`; an `auditor`/`regulator` party added to observer sets.
- The DAR **package id changes on every rebuild** → set `TACIT_PACKAGE_ID`.

## 5. Architecture (locked)
- **Next.js (server routes) → Daml JSON Ledger API → Canton.** No Java/Spring backend, no wallet, no external database — the deal lives on the ledger.
- **Local dev:** the bundled Canton **sandbox** (`:6865`) + **JSON Ledger API** (`:7575`) — no Docker, no VM.
- **Auth:** dev JWT (HS256, `--allow-insecure-tokens`); **`ledgerId:"sandbox"` is required for command submission** (`/v1/create`, `/v1/exercise`).
- **Deploy:** a **production build** (`next build && next start`) on a VM running the same Daml stack, configured via env (`TACIT_PACKAGE_ID`, `DAML_JSON_API_URL`, `DAML_LEDGER_ID`).

## 6. Product surfaces
- **`/lens`** — the **Ledger Lens**: the demo *and* the product. `idle hero → live negotiation theater → reveal`. Perspective switcher (Public / Buyer / Provider A·B·C).
- **`/api/negotiate`** — runs a negotiation and settles it atomically on Canton; returns `{ transcript, deal, dealSource: 'ledger' | 'memory', ledger }`.
- **`/api/health`** — reachability + config (ledger URL, package id short) with **no secrets**; for smoke tests.
- **`npm run preflight`** — pre-demo/deploy smoke test (health + negotiate; reports ledger-backed vs fallback).
- ✅ **MCP server (built)** — Tacit exposed as tools (`mcp/`) any AI agent can call to transact privately on Canton, as its own party. (Consistent with §8.)

## 7. Design system (locked)
- **Premium light / institutional — NOT crypto-neon.**
- Background `#FAFAF9`, white cards, hairline border `rgba(0,0,0,0.06)`, accent **violet `#7C3AED`**, ink `#0A0A0B`.
- **JetBrains Mono** for data values, **Inter** for prose.
- Redaction = frosted `🔒 PRIVATE` pill; reveal = blur→sharp + a brief violet underline flash.
- **Honesty is a design rule:** an **ON CANTON** vs **DEMO FALLBACK** badge always shows the source; fallback mode **never** claims "live on Canton," a real contract id, or "settled atomically on Canton."

## 8. Scope

### ✅ In scope — v1 (built)
Sealed-bid negotiation · atomic award (`Rfs.Award`) · the Ledger Lens · live Canton write + per-party read-back · honest ledger/fallback labeling · `/api/health` + `preflight`.

### 🔜 Building toward (roadmap, in order)
1. ✅ **P2.1 — real payment (done):** a demo IOU transfers to the winner inside `Accept` so the award moves *value*, not just a record; `Settlement.paid` records it; visible to buyer + winner only.
2. ✅ **MCP integration (done):** an MCP server (`mcp/`) exposes Tacit as agent tools (`tacit_health` · `tacit_procure` · `tacit_explain_privacy`) — any AI agent can run a private procurement on Canton and get real contract ids. The differentiator ("infrastructure for the agent economy").
3. ✅ **Auditor / regulator persona (done):** a permissioned party observes the `Rfs` + `Settlement` (never a `SealedBid` or `Iou`) — a 6th Lens persona that verifies settlements (winner, price, amount paid) without seeing a single sealed bid. Compliance without surveillance.
4. ✅ **Tacit landing page (done):** `/` is a scroll-driven product story (5 beats) that hands off into `/lens`.
5. **Production deploy → live link**, then the **3-minute video**.

### 🚫 Explicitly out of scope (v1)
Real stablecoin / Canton Coin payments (demo IOU only) · multi-round / reverse auctions · a full reputation system (extension point only) · cross-participant multi-node enforcement (single-participant sandbox for the demo).

## 9. Non-negotiables / invariants
1. **Privacy is ledger-enforced and provable live.** (§3)
2. **Demo reliability above features:** deterministic fallback, honest labels, never hangs.
3. **Copy is always honest** about ledger vs. simulation.
4. **Premium light design** — no neon.
5. **Architecture stays** Next.js → JSON Ledger API direct.

## 10. Win condition
> A judge watches three AI agents negotiate a deal none of them could front-run, settled atomically on Canton with a real contract id, invisible to the public — and concludes that **this is the only chain where the coming agent economy can actually run.**

---

## 11. Amendments (post-lock)

> §1–§10 above is the locked v1 definition; these amendments record what shipped beyond it. Decision history is preserved, and no §4 template semantics changed.

### 2026-07-11 — Live on the Canton devnet
- **Deployment (§5 extended):** beyond the local sandbox, Tacit now runs on the **real shared Canton devnet** via **5North's hosted validator** — the **v2 JSON Ledger API** with **OAuth2 client-credentials** auth. `TACIT_LEDGER_MODE` selects `devnet | canton3-local | sandbox`. The "Next.js → JSON Ledger API direct" architecture (§5, non-negotiable) is preserved — only the API version + auth differ by mode.
- **Daml (§4):** the frozen v1 model was recompiled **verbatim** under SDK 3.4.11 (LF 2.x) as package `fdfbfcf0…` and **uploaded to the devnet validator**; `daml test` is green on both SDKs. This is a **deployment-compatibility toolchain migration only** — no template / choice / observer / field changes; the §4 model stays locked.
- **§8 reconciliation:** "Production deploy → live link" (roadmap #5) is **done** (public app on devnet). "Cross-participant multi-node enforcement," previously out-of-scope for the single-participant sandbox, is now **real** on the devnet Global Synchronizer. "(Roadmap) MCP" in §6 is corrected to **built**.
- **Still out of scope:** real stablecoin / Canton Coin (the `USD.demo` voucher remains a demo token); independent external provider runners (the three provider bidders are **app-operated**); reverse / multi-round auctions.
- Public evidence: **[docs/DEVNET_EVIDENCE.md](docs/DEVNET_EVIDENCE.md)**.

### 2026-07-11 — Tacit Work: the real provider spine (additive package)
- **New package (additive; §4 core untouched):** `tacit-work` (`9ab077f2…`) is a **new** Daml package **data-dependent on the frozen `tacit`** core. It adds the fulfillment lifecycle: `RequestDraft --Open--> (frozen Rfs + ActiveWorkRequest) --Assign(Settlement)--> Assignment --SubmitDelivery--> PrivateDelivery --Accept--> DeliveryReceipt`. No template / choice / observer in the frozen model changed.
- **Real provider processes:** three **separate long-running runner processes** discover work from Canton and **each bids as its own party** with its own private pricing policy (base cost + margin + complexity + local load) — never a shared multiplier, never returned to the buyer, never on-ledger. This upgrades the §8 roadmap item "independent provider runners + real service fulfillment + delivery receipt" to **shipped** (with the caveat below).
- **Real service:** the winner performs a real `site_audit` (bounded HTTPS fetch + security-header checks, SSRF-guarded: HTTPS+:443 only, private/loopback/metadata IP rejection, redirect re-validation, byte caps). The buyer **recomputes the SHA-256 off-ledger** and accepts only on a match — Daml proves visibility + payment + that a commitment was made, **not** that the bytes match; the buyer proves that and refuses to accept on mismatch.
- **Privacy (extends §3):** the `PrivateDelivery` (the report body) is visible to **buyer + winner only** — not the auditor, not losing providers. The `DeliveryReceipt` is visible to buyer + winner + auditor and carries **no report body**.
- **Honest caveats:** the runners are separate processes with **distinct parties** but share **one hosted-validator OAuth credential** — *not* separate validator operators or independently-credentialed institutions. `USD.demo` remains a demo voucher.
- Proven live on devnet: `npm run preflight:work` — 28/28 invariants incl. a tamper test + idempotent replay. Evidence: **[docs/WORK_EVIDENCE.md](docs/WORK_EVIDENCE.md)**.
