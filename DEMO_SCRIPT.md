# Tacit — 3-minute demo script

**Thesis in one line:** *AI agents are starting to transact. On a transparent chain every deal leaks your prices to competitors. Tacit settles agent commerce **privately** on the real Canton devnet — and the ledger, not the app, decides who sees what.*

**Setup before recording**
- The app is **live on the Canton devnet**: https://tacit.80-225-209-190.sslip.io. Confirm before recording:
  ```
  curl -s https://tacit.80-225-209-190.sslip.io/api/health                    # → "mode":"devnet","reachable":true
  APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-e2e.mjs --require-ledger   # → green, evidence block
  ```
- Warm one negotiation on `/lens` first (the first call can be slightly slow).
- Have the **persona switcher** visible and be ready to **copy the settlement contract id**.

**Honesty rule (on camera):** the badge reads whatever is true.
- On the shared devnet (the intended flow) it says **ON CANTON DEVNET** — say "this is the real Canton devnet, via 5North's hosted validator on the Global Synchronizer."
- If the devnet validator is unreachable mid-demo, the app flips to **DEMO FALLBACK** (deterministic, in-memory) — *say so out loud* and never claim a fallback deal touched the ledger. (A local Canton stack, `canton3-local`, is available as insurance and reads **ON CANTON · LOCAL** — also say so if used.)
- `USD.demo` is a **demo voucher**, not real money — say "a demo voucher" when it appears. The three providers are **built-in bidders**, not independent external services — the external-agent story is the MCP beat.

| Time | On screen | Say | If devnet is unreachable |
|---|---|---|---|
| **0:00–0:20** Hook | Landing hero: "The private economy for AI agents." | "Every deal your AI agent makes on a public chain broadcasts your prices and partners to competitors. That's the tax of transparency." | — |
| **0:20–0:40** Problem | Landing "problem" beat (the public-mempool leak vignette) | "Agents already buy data, compute, services from each other. Do it on a transparent chain and your entire negotiation is public." | — |
| **0:40–1:30** Live deal | `/lens` → ▶ Run negotiation → request posts, **three sealed bids** seal into 🔒 chips, **atomic award** fires, payment (a demo voucher) counts up. Badge: **ON CANTON DEVNET**. | "A buyer agent posts a request. Three built-in provider agents submit sealed bids — each price sealed. The buyer awards the lowest in **one atomic Canton transaction**: losers archived, winner paid a demo voucher, settlement recorded. This just committed to the Canton devnet." | Badge reads **DEMO FALLBACK**; say "the live validator dropped — this next part is a labeled simulation, not the ledger." |
| **1:30–2:10** The proof | Switch persona: **Public** (all sealed) → losing **Provider** (only its own bid) → **Buyer** (all) → **Auditor** (settlement + amount visible, **bids frosted**). | "Don't trust the claim — switch the persona. The losing provider never sees a competitor's price. The auditor verifies the settlement and the amount paid but **never a single sealed bid**. Compliance without surveillance. Every field's visibility is read back from the devnet ledger — the UI *cannot* lie." | identical (visibility is data-driven in both modes) |
| **2:10–2:40** Agent-to-agent (MCP) | Trigger `tacit_procure` from an external Claude agent (MCP); it settles as **its own Canton party**. Show the default buyer's history via `tacit_my_deals` — that deal is **absent**. | "A genuinely external AI agent transacts through Tacit as its own Canton party. Claude runs a private procurement — and the default buyer can't even see it happened." | run against the live app if reachable; otherwise narrate |
| **2:40–2:55** Undeniable | In the Lens, the active persona shows its **real party id** ("on Canton as `Tacit43kfBuyer::1220a14ca128…`"); **copy the full settlement contract id** from the settlement card. | "Here's the real devnet party fingerprint, and the real settlement contract id. Verify it yourself — `preflight-e2e --require-ledger` against our live URL settles a fresh deal and prints the id." | skip the copy; show `docs/DEVNET_EVIDENCE.md` instead |
| **2:55–3:00** Close | Landing close / wordmark. | "Tacit. The private economy for AI agents. Live on the Canton devnet." | — |

**What makes this win:** almost every submission shows a localhost mock and *says* "runs on Canton." This shows a **real contract id on the real Canton devnet** plus a **persona switch that proves ledger-enforced privacy** — the two things that are hard to fake and easy for a judge to verify (`curl /api/health` → `mode:devnet`, then `preflight-e2e --require-ledger`).
