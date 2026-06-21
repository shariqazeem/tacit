# TACIT — Current State (Starting Line)
> Point-in-time snapshot: **where we stand before writing the first line of Tacit code.**
> Last updated: **2026-06-21**. Companion to [PROMPT_ENGINEER_BRIEF.md](PROMPT_ENGINEER_BRIEF.md) (full strategy & build plan).

---

## 📍 One-liner
**Strategy is locked, the repo is reset, the build hasn't started.** We have a clean fresh repo containing a proven agentic-commerce engine (ported from ParallaxPay) and zero Canton/Daml code yet. Next action = build the **Ledger Lens** wow screen with mock data (Phase 0).

---

## 🧭 Snapshot
| | |
|---|---|
| **Project** | Tacit — *the private economy for AI agents* |
| **What it is** | Private agent-to-agent commerce on Canton: agents negotiate via sealed bids, settle atomically, public ledger reveals nothing |
| **Hackathon** | Canton Foundation — "Build the applications that bring users to Canton" · $7,000 · top 3 |
| **Primary track** | 3 — Payments, Neobanking & **Agentic Commerce (w/ privacy)** |
| **Deadline** | ⚠️ **UNCONFIRMED** — must fill in (scoping assumes ~72h) |
| **Repo** | Fresh, local-only · branch `main` · initial commit `ec7865d` · 150 files · **not yet pushed to GitHub** |
| **Current phase** | **Pre-P0** — about to start the first build prompt |
| **Tacit/Canton code written** | **0** — none yet |

---

## ✅ Done so far (planning + reset)
- [x] Picked the hackathon and the winning angle (agentic commerce + privacy on Canton)
- [x] Evaluated & **rejected** invoice-financing; **chose** private agent-to-agent commerce
- [x] Researched Canton's real dev path (Daml privacy model, `cn-quickstart`, JSON Ledger API, `@c7` libs)
- [x] Named the project **Tacit** (swap candidates: Sotto, Veil)
- [x] Dismissed the old local git repo (`rm -rf .git`; GitHub copy untouched)
- [x] Hardened `.gitignore` (excluded `p2p.key`, `*.key`, `/logs/`, `*.log`) — verified **no secrets staged**
- [x] Renamed project in `package.json` → `tacit`
- [x] Initialized fresh repo + clean initial commit on `main`
- [x] Wrote the full strategic brief + handover ([PROMPT_ENGINEER_BRIEF.md](PROMPT_ENGINEER_BRIEF.md))
- [x] Wrote this status doc

---

## 🟡 In the repo right now (inherited engine — untouched, not yet adapted)
Ported wholesale from ParallaxPay; **still in its original Solana/x402 form**:
- Next.js 15 · React 19 · TypeScript · Tailwind v4 · Framer Motion · React Three Fiber · custom `server.js`
- Agent framework (6 agent types), marketplace UI, live activity feed, reputation, oracle
- Supabase (off-chain data) · MCP server · Docker/nginx infra
- **Payment layer = Solana + x402 + `@faremeter/*` + wallet-adapter** ← this is what gets replaced
- Old `README.md` still describes ParallaxPay (superseded by the brief; rewrite is a later task)

> Nothing here has been adapted for Tacit yet. It's the raw material we port from.

---

## 🔴 Not started (everything Tacit-specific)
- [ ] **Ledger Lens** wow screen (mock data) — *the immediate next step*
- [ ] Canton toolchain running locally (`cn-quickstart`, Daml SDK, Daml shell)
- [ ] Daml contracts: `Service`, `RFS`, `SealedBid`, `Settlement`, `Token`, `Reputation`
- [ ] Proof of sealed-bid privacy in the Daml shell
- [ ] Ledger Lens wired to the real Canton ledger
- [ ] Agent bidding loop on Canton (post RFS → auto-bid → auto-select → atomic settle)
- [ ] Marketplace/feed re-pointed to Canton
- [ ] Removal of dead Solana/x402 code
- [ ] Scripted 3-min demo + seeded data + deck + video + live link

---

## 🎯 Immediate next action
Run the **first Claude Code prompt** in [PROMPT_ENGINEER_BRIEF.md §4.5](PROMPT_ENGINEER_BRIEF.md) → builds the **Ledger Lens** (perspective-switcher that redacts/reveals a deal based on who's looking) on the existing app with mock data. This is our jaw-drop demo artifact, built *before* any blockchain work so we always have something to show.

---

## 🚧 Open decisions / blockers
1. **⚠️ Deadline** — confirm it; everything is scoped to the time we have.
2. **Name** — Tacit is provisional; lock it or swap (Sotto / Veil).
3. **Payment token on Canton** — simple Daml IOU (default, protects timeline) vs. Canton Coin/Splice — decide in Phase 2.
4. **GitHub** — fresh repo not yet created/pushed; keep private until submission, then flip public.

---

## 📊 Phase progress (from the brief §4.4)
`P0` Ledger Lens (mock) · `P1` Canton spike · `P2` Daml core · `P3` Lens→live · `P4` agent loop · `P5` product + demo · `P6` stretch
**→ All phases: not started. We are at the line, ready to run P0.**
