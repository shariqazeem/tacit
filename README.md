# Tacit

> **The private economy for AI agents.** Agents already buy data, compute, and services from each other. On a transparent chain, every deal broadcasts your prices and partners. **Tacit** settles agent commerce privately on **Canton** — agents negotiate via sealed bids, the buyer awards *and pays* the winner atomically in one Daml transaction, and **the ledger itself** controls who can see what.

`Canton` · `Daml` · `Next.js 15` · `TypeScript`

Two routes: **`/`** — a scroll-driven product story. **`/lens`** — the live product (watch a negotiation settle, then switch personas to see the ledger-enforced privacy).

---

## The problem
AI agents are about to transact at scale — buying data, compute, and services from one another. On a transparent chain, every agent payment broadcasts your prices, counterparties, and margins to competitors. That's a non-starter for real business.

## What Tacit does
Tacit runs agent-to-agent commerce on Canton, where **privacy is enforced by the ledger, not by application code**:

- A **buyer agent** posts a request for a service.
- Three **provider agents** submit **sealed bids** — each price is visible only to that provider and the buyer; competing providers cannot see it.
- The buyer **awards the lowest bid atomically**: one Daml transaction archives the losing bids, accepts the winner, **transfers a demo IOU (`USD.demo` voucher) to the winning provider**, creates the settlement, and closes the auction — all-or-nothing.
- The **Ledger Lens** lets you switch perspective (Public · Buyer · Provider A/B/C · **Auditor**) and watch — field by field — exactly what Canton reveals to each party. The payment is visible only to the buyer and the winner; losers and the public see a frosted `PRIVATE`. The visibility on screen is read back from the live ledger.
- A permissioned **Auditor** observes the request + the settlement (winner, price, amount paid) but is **never** a stakeholder of a sealed bid or an IOU — so it verifies *what settled* without seeing a single bid or any provider's wealth. **Compliance without surveillance.** Deals also carry their **title + category on-ledger**.

> The transferred value is a **demo voucher (`USD.demo`)**, deliberately not a stablecoin — real stablecoin settlement is the next roadmap step.

## Why Canton
- **Sub-transaction privacy** — a `SealedBid` is signed by its provider with the buyer as the *only* observer, so the ledger hides each price from competitors. That one line is the moat.
- **Atomic multi-party settlement _with payment_** — the award is a single Daml `choice` (`Rfs.Award`): reject losers + accept winner + **transfer the IOU to the winner** + create the `Settlement` (recording the amount paid) + close the RFS, all-or-nothing, guaranteed by the ledger. Value moves *inside* the same transaction as the award.

## The demo — `/lens`
Idle hero → a live negotiation plays out → the **Ledger Lens** reveals the deal with a **real Canton settlement contract id**. Switch personas to see each sealed bid frosted for competitors, visible for the buyer, and hidden from the public. A top-right badge shows **ON CANTON** (live ledger) vs **DEMO FALLBACK** (deterministic offline simulation), so the demo is always honest about its source.

## How it works
`Next.js → Daml JSON Ledger API → Canton.` The negotiation route writes `Rfs` + `SealedBid` ×3, exercises `Rfs.Award`, then reads the deal back **as each party**, so the Lens's `visibleTo` is *derived from the ledger*. Agents price bids via an LLM with a deterministic fallback, so the demo never hangs.

**Full architecture, run guide, and demo checklist → [CURRENT_STATE.md](CURRENT_STATE.md).**

## Run it
Prereqs: JDK 17, Daml SDK 2.10.4, Node. (More detail in [CURRENT_STATE.md §6](CURRENT_STATE.md).)

```bash
# 0) toolchain on PATH
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk@17"

# 1) build the DAR (this mints the package id) + prove the model
cd daml && daml build && daml test && cd ..        # daml test → ok, 2 active contracts, 10 transactions

# 2) start the local Canton stack with the new DAR
daml sandbox  --dar daml/.daml/dist/tacit-0.1.0.dar --port 6865 --port-file /tmp/sandbox-port.txt --wall-clock-time &
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens &

# 3) run the app, pinned to the DAR's package id
npm install && npm run build
TACIT_PACKAGE_ID=c0f7a95e01d57cc04dd72478d7886b98556d0831956767ac8e84f42b664bde1a PORT=3000 npm start
#   → http://localhost:3000/       (landing)
#   → http://localhost:3000/lens   (live product)

# 4) smoke test — expect "LEDGER-backed" + "PAYMENT VERIFIED"
APP_URL=http://localhost:3000 npm run preflight
```

> **Rebuilt the DAR?** `daml build` mints a **new** package id. Update `TACIT_PACKAGE_ID` (and the hardcoded default in `app/lens/ledger/client.ts`), then restart the sandbox with the new DAR. `/api/health` shows the active short id and whether it came from the env. The current default is `c0f7a95e…`.
>
> No ledger running? The app still works in a clearly-labeled **DEMO FALLBACK** mode (deterministic, in-memory, **no payment** — nothing claims value moved).

## Screenshots
<!-- TODO: add after recording the demo -->
- [ ] `/` — hero (the private economy for AI agents)
- [ ] `/` — the mechanic (sealed bids → award → paid)
- [ ] `/lens` — the reveal with the `VALUE TRANSFERRED` receipt + real IOU contract id
- [ ] `/lens` — persona proof (Provider A: own bid visible, competitors + payment frosted)
- [ ] 3-min walkthrough video

## MCP — use Tacit from any AI agent
Tacit ships an **MCP server** ([`mcp/`](mcp/)) so any MCP-capable agent (Claude Code, Claude Desktop, …) can run a **private sealed-bid procurement on Canton** and get real contract ids back. It is a **thin client** of the app's HTTP API — one source of truth.

Tools: **`tacit_health`** · **`tacit_procure`** `{ description, maxBudget, buyerName? }` (run a private procurement **as your own Canton party**, award & pay the winner atomically, return the settlement + IOU ids — **ON CANTON** vs **SIMULATION**) · **`tacit_my_deals`** `{ buyerName }` (audit *your* deal history — you see only what your party is a stakeholder of; another agent's deals are invisible) · **`tacit_explain_privacy`**. `tacit_procure` + `tacit_my_deals` also return `structuredContent` so agents can branch without parsing prose.

```bash
npm run mcp:build                       # installs deps + builds mcp/dist/server.js
# with the Tacit app running (default http://localhost:3100):
claude mcp add tacit -- node "$(pwd)/mcp/dist/server.js"
```
Or open this repo in Claude Code — the checked-in [`.mcp.json`](.mcp.json) registers it automatically (`/mcp` to approve + list). Details + a `claude_desktop_config.json` example in [mcp/README.md](mcp/README.md).

**Sample transcript (live ledger):**
```
tacit_procure({ description: "Competitive analysis of three DeFi lending protocols", maxBudget: 120 })

PROCUREMENT — Competitive analysis of three DeFi lending protocols
Budget < $120 · 3 sealed bids received

✅ ON CANTON — awarded and paid in one atomic Daml transaction ...
Winner: Provider C at $67
Settlement contract: 00a55dec0106e7b8…d818acce6b8d
Payment: 67 USD.demo transferred to the winner — IOU contract 00fe47e324e0b656…3e76ecf7

Sealed bids: each losing provider never saw competitors' prices — enforced by
Canton's signatory/observer model, not by application code.
View this deal in the Ledger Lens: http://localhost:3100/lens
```

## A real economy on the ledger
- **Agents that reason** — when an LLM key is set (`GRADIENT_API_KEY`), each provider gets ONE structured call with its OWN private cost model for the inferred service category (research/data/compute/creative) plus its ledger balance, and bids accordingly (prices clamped to a sane band; any failure → its deterministic fallback). No key → the deterministic multipliers, unchanged. The `/lens` theater shows an **LLM AGENTS** chip only when a real model produced the bids.
- **Ledger-persistent wealth** — provider "wealth" is the sum of the demo IOUs each provider actually **owns** on the ledger. Run a deal and the winner's balance grows *by exactly the price*. `GET /api/economy` returns it (live-queried, `available:false` when Canton is down); the `/lens` economy strip and the landing stats surface it.
- **Agent-to-agent privacy** — an external agent settles as its **own Canton party** (`buyerName`). Its deal is invisible to every other party:
```
tacit_my_deals({ buyerName: "JudgeAgent" })  → 1 settlement (Provider C · $50 · 00ae38ad8f20…)
tacit_my_deals({ buyerName: "Buyer" })       → 5 OTHER settlements — JudgeAgent's deal is NOT among them
```
The ledger, not the app, decides who can see what.

## Tech
Daml 2.10 on Canton (sandbox + JSON Ledger API) · Next.js 15 / React 19 / TypeScript / Tailwind · MCP via `@modelcontextprotocol/sdk`.

## Hackathon
Built for the **Canton Foundation** hackathon — tracks: *Private DeFi & Capital Markets* and *Payments, Neobanking & Agentic Commerce*.

---
*Privacy is enforced by the ledger — see it for yourself in the Ledger Lens.*
