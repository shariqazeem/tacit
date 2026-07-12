# Tacit — the private economy for AI agents

**Tacit lets AI agents buy and sell services from each other with sealed-bid privacy and atomic settlement on Canton — the ledger itself decides who sees what, so no agent can front-run another's price.**

`Canton devnet` · `Daml 3.4.11` · `v2 JSON Ledger API + OAuth2` · `Next.js 15 / React 19 / TypeScript` · `MCP`

> 🟢 **Live on the real Canton devnet.** Not a sandbox, not a mock. The full app settles real deals through **5North's hosted validator on the Canton Global Synchronizer**, with real contract ids.

- **Live app (HTTPS):** **https://tacit.80-225-209-190.sslip.io** — [`/work`](https://tacit.80-225-209-190.sslip.io/work) (run a real private procurement) · [`/lens`](https://tacit.80-225-209-190.sslip.io/lens) (watch a deal settle, then switch personas to see the ledger-enforced privacy).
- **Live proof:** `curl https://tacit.80-225-209-190.sslip.io/api/work/health` → `"ok":true,"mode":"devnet"`. Work evidence: **[docs/WORK_EVIDENCE.md](docs/WORK_EVIDENCE.md)** · devnet evidence: **[docs/DEVNET_EVIDENCE.md](docs/DEVNET_EVIDENCE.md)**.
- *(Emergency origin, not judge-facing: `http://80.225.209.190:3200`.)*

### Verify it's real in ~60–90 seconds
```bash
# 1) the deployed app is in devnet mode with all three provider runners ready:
curl -s https://tacit.80-225-209-190.sslip.io/api/work/health   # → "ok":true,"mode":"devnet","runners":3

# 2) run a REAL private procurement + prove all 48 work invariants (tamper + idempotent replay):
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-work-e2e.mjs --require-ledger --require-runners

# 3) settle a sealed-bid deal + prove all 11 original privacy invariants:
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-e2e.mjs --require-ledger
#   Both --require-ledger flags EXIT NON-ZERO on DEMO FALLBACK — a pass proves a ledger-backed devnet run.
```

---

## The problem
AI agents are becoming economic actors — buying data, compute, and services from one another at scale. On a transparent chain, **every agent payment broadcasts your prices, counterparties, and margins to competitors.** That's a non-starter for real business. The coming agent economy needs a settlement layer that is **private *and* atomic**.

## What Tacit does
Sealed-bid procurement between agents, where **privacy is enforced by the ledger, not by application code**:

1. A **buyer agent** posts a request for a service (with a budget).
2. Three **provider agents** submit **sealed bids** — each price is visible only to that provider and the buyer; competitors cannot see it.
3. The buyer **awards the lowest bid atomically** — one Daml transaction archives the losers, accepts the winner, **transfers a `USD.demo` voucher to the winner**, creates the settlement (recording the amount paid), and closes the auction. All-or-nothing.
4. The **Ledger Lens** (`/lens`) lets you switch perspective — **Public · Buyer · Provider A/B/C · Auditor** — and see, field by field, exactly what Canton reveals to each party. Every field's visibility is **read back from live per-party devnet queries**, so the UI cannot lie.
5. A permissioned **Auditor** verifies every settlement (winner, price, amount paid) but is **never** a stakeholder of a sealed bid or an IOU — compliance without surveillance.

## Why Canton is load-bearing
- **Sub-transaction privacy is a property of the ledger.** A `SealedBid` is signed by its provider with the buyer as the *only* observer, so Canton **never returns the contract to a competitor.** That single signatory/observer line is the moat — no application code enforces it, so no application bug can break it.
- **Atomic multi-party settlement with payment.** The award is one Daml `choice` (`Rfs.Award`): reject losers + accept winner + transfer the IOU + create the `Settlement` + close the RFS — all-or-nothing, guaranteed by the ledger. On a transparent chain you'd get privacy *or* atomic composition; Canton gives both.

---

## Real vs Simulated vs Roadmap
| Capability | Status |
|---|---|
| Runs on the **real shared Canton devnet** (5North validator + Global Synchronizer) | ✅ **Real** |
| Ledger-enforced sealed-bid privacy (per-party read-back) | ✅ **Real** |
| Atomic award (`Rfs.Award`) — one Daml transaction | ✅ **Real** |
| `USD.demo` value transfer inside that transaction | ✅ **Real transfer** — but of a **demo voucher**, see below |
| Auditor persona (sees settlements, never bids/IOUs) | ✅ **Real** |
| MCP: external agent transacts as its **own** Canton party | ✅ **Real** |
| Our Daml DAR deployed on devnet (`fdfbfcf0…`) | ✅ **Real** |
| **Tacit Work:** separate provider runner processes, each bidding as its **own** Canton party (`tacit-work` pkg `9ab077f2…`) | ✅ **Real** — [docs/WORK_EVIDENCE.md](docs/WORK_EVIDENCE.md) |
| **Tacit Work:** winner runs a **real** `site_audit`; buyer recomputes SHA-256 off-ledger and refuses to accept on mismatch | ✅ **Real** |
| **Tacit Work:** private delivery (report hidden from the auditor & losers) + auditor-visible receipt (no report body) | ✅ **Real** |
| MCP: `tacit_procure` (negotiate) + `tacit_procure_work` (real work spine) — an agent transacts as its **own** Canton party, no fallback | ✅ **Real** |
| The provider bidders in the **`/lens` negotiation demo** | 🟡 **App-operated** — run inside the app (deterministic / LLM-assisted). *Tacit Work* (above) uses separate runner processes. |
| Tacit Work runners: **separate processes, distinct parties**, but one shared hosted-validator OAuth credential | 🟡 **Not** separate validator operators or independently-credentialed institutions. |
| `USD.demo` payment token | 🟡 **Demo voucher** — self-issued by the buyer. *Not* real money, a stablecoin, or Canton Coin. |
| DEMO FALLBACK mode (ledger unreachable) | 🟡 **Simulated** — deterministic, in-memory, **clearly labeled**, and it never claims value moved. |
| Stablecoin / Canton Coin settlement | 🔜 Roadmap |
| More service adapters beyond `site_audit` | 🔜 Roadmap |

## Tacit Work — the real provider spine (additive)
Beyond the negotiation demo, **Tacit Work** runs the full fulfillment lifecycle on devnet.
Three **separate runner processes** discover a work request from Canton and **each bids as
its own party** with its own private pricing (base cost + margin + complexity + load — never
shared, never on-ledger). The buyer awards + prepays the lowest bid, the **winner performs a
real `site_audit`** and delivers it privately, and the buyer **recomputes the SHA-256
off-ledger** — accepting only on a match, which yields an **auditor-visible receipt that
contains no report body**.

```bash
# 3 runners + app in devnet mode, then:
npm run preflight:work     # 48/48 invariants incl. per-party bid privacy, a tamper test + idempotent replay
```
It's a new Daml package (`tacit-work`, `9ab077f2…`) **data-dependent on the frozen `tacit`
core** — the demo is untouched. Evidence + contract ids: [docs/WORK_EVIDENCE.md](docs/WORK_EVIDENCE.md).
Runners are separate processes with **distinct parties** but share one hosted-validator OAuth
credential — **not** separate validator operators. `site_audit` is the first real adapter;
Daml proves *who sees what* and *that payment happened*, the **buyer** proves the bytes match.

## Devnet architecture (exact)
```
Browser / MCP
      │  (HTTPS → nginx → Next.js app on :3200 → cantonV2 adapter, OAuth2 + v2 JSON Ledger API)
      ▼
Tacit Work buyer
      │  opens a private request on Canton (frozen Rfs + ActiveWorkRequest)
      ▼
Provider Runner A / B / C          ← three separate loopback processes, distinct Canton parties
      │  each reads the request and submits its OWN sealed bid (never sees a competitor's)
      ▼
Frozen atomic Award + USD.demo prepayment   ← one Daml transaction (Rfs.Award), lowest bid wins
      │
      ▼
Winner performs site_audit          ← real, SSRF-guarded HTTPS audit
      │
      ▼
PrivateDelivery → buyer hash check → DeliveryReceipt
   (buyer + winner only)   (SHA-256 off-ledger)   (buyer + winner + auditor; no report body)
```
All three provider runners are **separate processes with distinct Canton parties**, but they share
**one** hosted-validator OAuth credential — **not** separate validators or organizations.
The `/` story and `/lens` privacy explorer ride the same app; `/lens` shows the negotiation demo.
```
5North devnet validator (v2 JSON Ledger API) ─▶ Canton Global Synchronizer (shared devnet)
```
- **Auth:** OAuth2 **client-credentials** → the validator's **v2 JSON Ledger API** (Bearer JWT, `daml_ledger_api` scope, 8h TTL; the adapter caches + refreshes on 401). **The client secret is never in this repo** — it lives in the 5North access PDF and the server's private env file.
- **The app is a thin ledger client.** One `TACIT_LEDGER_MODE` env selects the target: `devnet` (live), `canton3-local` (Splice LocalNet — real Canton 3.x, dev/insurance), or `sandbox` (Daml 2.x — the offline DEMO FALLBACK tier). Same app code for all three.
- **Shared-validator specifics:** parties are pre-allocated with unique prefixes and **pinned** (the shared validator won't list parties), and the ledger-api user is granted `CanActAs` per party. See [DEPLOY.md](DEPLOY.md).

## The atomic transaction
`Rfs.Award(winningBid, losingBids, paymentCid)` — one consuming Daml choice, controller = buyer:
1. validate the winning bid (right RFS, right buyer, within budget),
2. `Reject` every losing `SealedBid` (archived),
3. `Accept` the winner → verify the IOU covers the price → **`Transfer` the IOU to the winner** → create the `Settlement` (with `paid = Some (amount, "USD.demo")`),
4. consume the `Rfs` (no double-award).
If any step fails, the whole transaction rolls back — the losers stay open, no payment moves, no settlement exists. Value moves *inside the same transaction* as the award.

## Privacy visibility matrix
What each persona can see, **as enforced by the ledger** (✅ visible · 🔒 frosted `PRIVATE`):

| Field | Public | Buyer | Provider A | Provider B | Provider C (winner) | Auditor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| A deal exists / settled | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Request (title, budget) | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Provider A's sealed price | 🔒 | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| Provider C's sealed price | 🔒 | ✅ | 🔒 | 🔒 | ✅ | 🔒 |
| Winner + settled amount | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| Payment IOU contract id | 🔒 | ✅ | 🔒 | 🔒 | ✅ | 🔒 |

The **Auditor** sees the settlement and the amount paid, but **never a single sealed bid or the IOU** — it verifies *what settled* without seeing *how anyone bid* or *who holds what*.

## The 11 live privacy invariants
`scripts/preflight-e2e.mjs` settles a real deal on devnet and asserts all of these against per-party ledger reads (see [docs/DEVNET_EVIDENCE.md](docs/DEVNET_EVIDENCE.md) for the list + a passing run). A failure exits non-zero — we do not turn a failing check into a passing claim.

## MCP — an external agent transacts as its own Canton party
Tacit ships an **MCP server** ([`mcp/`](mcp/)) so any MCP-capable agent (Claude Code / Desktop) can run real Canton commerce as **its own party** and get real contract ids back. It's a thin client of the app's HTTP API. **Primary (Tacit Work):** `tacit_work_health` · `tacit_procure_work` `{ url, maxBudget, jobId?, buyerLabel? }` — an agent procures a real audit (no fallback; errors if the network isn't ready). **Negotiation demo:** `tacit_procure` `{ description, maxBudget, buyerName? }` · `tacit_my_deals` `{ buyerName }` · `tacit_health` · `tacit_explain_privacy`. Agent-to-agent isolation is real: `tacit_my_deals` for one agent never returns another agent's deals — the ledger, not the app, decides who sees what.

## Live public evidence (from a verification run — new ids each run)
- **Package / DAR:** `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` (Daml 3.4.11, name `tacit`), uploaded to the devnet validator.
- **Settlement contract:** `002b277491de20858b6d1ff8f583643027f2bca77c90d950e9e3accc39b9dc7055ca1212208474cc1018fe1008c5af3503934112e17cfd7e57b21572eb25c7ec6736684a39`
- **Payment IOU contract:** `005beb3a90c5d3d706d45e09cc39b0e683cc21848a3186b175f56a3fd21238cad0ca121220ff8505ed4f738409f35c531adfd1d97de77039814e6e8d3066cded06a84c5fb2`
- **Winner:** Provider C · **34 USD.demo** (demo voucher, not real currency).

## Run it locally
Prereqs: JDK 17, Daml SDK 2.10.4 **and** 3.4.11, Node 20+.
```bash
npm install
npm run typecheck                 # tsc --noEmit
npm run build                     # next build
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.daml/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
( cd daml && daml test )          # v1 model proof  → test ok (2/10), testAuditor ok (4/11)
npm run daml:test:v2              # v2 model proof  → identical under Daml 3.4.11

# Verify the LIVE devnet deployment over HTTPS (no local ledger needed):
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-work-e2e.mjs --require-ledger --require-runners
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-e2e.mjs --require-ledger
```
To run the app yourself against devnet you need the 5North OAuth creds (not in this repo) — see [DEPLOY.md](DEPLOY.md). Without a ledger, the app runs in clearly-labeled **DEMO FALLBACK** (deterministic, in-memory, no payment claimed).

## Repository structure
```
app/
  page.tsx · layout.tsx · globals.css        # the / landing (5-beat scroll story)
  landing/                                    # Hero · Problem · Mechanic · Proof · Close
  lens/                                       # the /lens product
    components/  LensExperience · NegotiationTheater · LensView · PersonaSwitcher · SourceBadge · …
    agents/      negotiation · profiles (private cost models) · llm
    ledger/      client (facade) · adapters/{sandboxV1,cantonV2,config,types} · write · read · economy
  api/           negotiate · economy · health
daml/            Tacit/Sealed.daml (v1, SDK 2.10.4)         # frozen c0f7a95e…
daml3/           Tacit/Sealed.daml (v2, SDK 3.4.11)         # frozen fdfbfcf0… (on devnet)
daml3-test/      Tacit/Test.daml (v2 daml test)
mcp/             MCP server (thin client of the app API)
scripts/         preflight-e2e · devnet-bootstrap · canton3-smoke · canton3-local.sh · preflight
docs/            DEVNET_EVIDENCE.md
```

## Docs
- **[DEVNET_EVIDENCE.md](docs/DEVNET_EVIDENCE.md)** — public devnet proof (endpoints, contract ids, invariants, how to verify)
- **[DEPLOY.md](DEPLOY.md)** — deployment + the three ledger modes
- **[CURRENT_STATE.md](CURRENT_STATE.md)** — complete technical status (real vs demo, architecture, env, evidence)
- **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)** — 3-minute demo storyboard
- **[SPEC.md](SPEC.md)** — locked product spec + amendments

## Hackathon
Built for the **Build on Canton Hackathon** (Encode Club).

---
*Privacy is enforced by the ledger — verify it for yourself in the Ledger Lens, or with `preflight-e2e --require-ledger`.*
