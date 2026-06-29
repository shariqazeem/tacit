# Tacit

> **The private economy for AI agents.** A private agent-to-agent commerce layer on **Canton** — AI agents negotiate via sealed bids, the buyer awards atomically through a Daml choice, and **the ledger itself** controls who can see what.

`Canton` · `Daml` · `Next.js 15` · `TypeScript`

---

## The problem
AI agents are about to transact at scale — buying data, compute, and services from one another. On a transparent chain, every agent payment broadcasts your prices, counterparties, and margins to competitors. That's a non-starter for real business.

## What Tacit does
Tacit runs agent-to-agent commerce on Canton, where **privacy is enforced by the ledger, not by application code**:

- A **buyer agent** posts a request for a service.
- Three **provider agents** submit **sealed bids** — each price is visible only to that provider and the buyer; competing providers cannot see it.
- The buyer **awards the lowest bid atomically**: one Daml transaction archives the losing bids, creates the settlement, and closes the auction.
- The **Ledger Lens** lets you switch perspective (Public · Buyer · Provider A/B/C) and watch — field by field — exactly what Canton reveals to each party. The visibility on screen is read back from the live ledger.

## Why Canton
- **Sub-transaction privacy** — a `SealedBid` is signed by its provider with the buyer as the *only* observer, so the ledger hides each price from competitors. That one line is the moat.
- **Atomic multi-party settlement** — the award is a single Daml `choice` (`Rfs.Award`): reject losers + accept winner (creating the `Settlement`) + close the RFS, all-or-nothing, guaranteed by the ledger.

## The demo — `/lens`
Idle hero → a live negotiation plays out → the **Ledger Lens** reveals the deal with a **real Canton settlement contract id**. Switch personas to see each sealed bid frosted for competitors, visible for the buyer, and hidden from the public. A top-right badge shows **ON CANTON** (live ledger) vs **DEMO FALLBACK** (deterministic offline simulation), so the demo is always honest about its source.

## How it works
`Next.js → Daml JSON Ledger API → Canton.` The negotiation route writes `Rfs` + `SealedBid` ×3, exercises `Rfs.Award`, then reads the deal back **as each party**, so the Lens's `visibleTo` is *derived from the ledger*. Agents price bids via an LLM with a deterministic fallback, so the demo never hangs.

**Full architecture, run guide, and demo checklist → [CURRENT_STATE.md](CURRENT_STATE.md).**

## Run it locally
Prereqs: JDK 17, Daml SDK 2.10.4, Node. (Exact commands in [CURRENT_STATE.md §6](CURRENT_STATE.md).)
```bash
cd daml && daml build
daml sandbox --dar daml/.daml/dist/tacit-0.1.0.dar --port 6865 --port-file /tmp/sandbox-port.txt --wall-clock-time
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens
npm install && PORT=3100 NODE_ENV=development npm run dev   # open http://localhost:3100/lens
APP_URL=http://localhost:3100 npm run preflight             # smoke test
```

## Tech
Daml 2.10 on Canton (sandbox + JSON Ledger API) · Next.js 15 / React 19 / TypeScript / Tailwind.

## Hackathon
Built for the **Canton Foundation** hackathon — tracks: *Private DeFi & Capital Markets* and *Payments, Neobanking & Agentic Commerce*.

---
*Privacy is enforced by the ledger — see it for yourself in the Ledger Lens.*
