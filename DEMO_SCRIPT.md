# Tacit — 3-minute demo script

**Thesis in one line:** *AI agents are starting to transact. On a transparent chain every deal leaks your prices to competitors. Tacit settles agent commerce **privately** on Canton — and the ledger, not the app, decides who sees what.*

**Setup before recording**
- Ledger up (devnet validator, or canton3-local LocalNet); app running against it; run `npm run preflight:e2e -- --require-ledger` and confirm green + an evidence block.
- Warm one negotiation first (a cold participant can be slow on the first call).
- Have the **Verify drawer** ready to open and the **persona switcher** visible.

**Honesty rule (on camera):** the badge reads whatever is true. If we're on the shared devnet it says **ON CANTON DEVNET**; if we're on the local Splice network it says **ON CANTON · LOCAL** and you *say so out loud*: "this is the exact devnet code path running on a local Canton network while our IP allowlist finalizes." Never call local "devnet."

| Time | On screen | Say | Contingency (canton3-local) |
|---|---|---|---|
| **0:00–0:20** Hook | Landing hero: "The private economy for AI agents." | "Every deal your AI agent makes on a public chain broadcasts your prices and partners to your competitors. That's the tax of transparency." | — |
| **0:20–0:40** Problem | Landing "problem" beat (the public-mempool leak vignette) | "Agents already buy data, compute, services from each other. Do it on a transparent chain and your entire negotiation is public." | — |
| **0:40–1:30** Live deal | `/lens` → ▶ Run negotiation → request posts, **three sealed bids** land and seal into 🔒 chips, **atomic award** fires, payment counts up. Badge: **ON CANTON DEVNET**. | "A buyer agent posts a request. Three provider agents submit sealed bids — each price sealed. The buyer awards the lowest in **one atomic Canton transaction**: losers archived, winner paid, settlement recorded. This just committed to Canton devnet." | Badge says **ON CANTON · LOCAL**; say "running on a live local Canton network — the same v2 ledger code we run on devnet." |
| **1:30–2:10** The proof | Switch persona: **Public** (all sealed) → losing **Provider** (sees only its own bid) → **Buyer** (sees all) → **Auditor** (sees the settlement + amount, **bids stay frosted**). | "Don't trust my claim — switch the persona. The losing provider never sees a competitor's price. The auditor can verify the settlement and the amount paid, but **never a single sealed bid**. Compliance without surveillance. This visibility is read back from the ledger — the UI *cannot* lie." | identical |
| **2:10–2:40** Agent-to-agent (MCP) | Trigger `tacit_procure` from an external Claude agent (MCP); it settles as **its own Canton party**. Show the default buyer's history — that deal is **absent**. | "Any external AI agent can transact through Tacit as its own Canton party. Here Claude runs a private procurement — and the default buyer can't even see it happened." | identical |
| **2:40–2:55** Undeniable | Economy strip ticks up. Open the **Verify drawer**: real **settlement contract id** + the settling **party ids** (full `name::fingerprint`) + a copyable query. | "The economy grew by exactly the price that moved. Here's the real contract id on Canton devnet, and the real party fingerprints — verify it yourself." | Read the id; say "on our local Canton network — the devnet id will be identical in shape once our validator IP is live." |
| **2:55–3:00** Close | Landing close / wordmark. | "Tacit. The private economy for AI agents. Live on Canton." | "…on Canton — devnet the moment our node is allowlisted." |

**What makes this win:** almost every submission will show a localhost mock and *say* "runs on Canton." This shows a **real contract id resolving on a real Canton participant** plus a **persona switch that proves ledger-enforced privacy** — the two things that are hard to fake and easy for a judge to verify.
