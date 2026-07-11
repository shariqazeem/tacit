# Tacit — Canton Devnet Evidence

Public, judge-verifiable evidence that Tacit runs on the **real shared Canton devnet**. Contains **no credentials** — the OAuth client secret lives only in the 5North access PDF and the server's private env file, never in this repo.

## Verification run
| Field | Value |
|---|---|
| **Captured (UTC)** | 2026-07-11 · 09:32 UTC |
| **Ledger mode** | `devnet` (live) |
| **Ledger API** | `https://ledger-api.validator.devnet.sandbox.fivenorth.io` (5North hosted validator on the Canton devnet Global Synchronizer) |
| **Auth** | OAuth2 client-credentials → v2 JSON Ledger API (Bearer JWT, `daml_ledger_api` scope, 8h TTL) |
| **Package / DAR** | `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` (Daml 3.4.11, package name `tacit`) — uploaded to the devnet validator |
| **Public app** | http://80.225.209.190:3200 (HTTP-only; `/api/health` reports `mode: devnet`) |

## A settled deal on devnet (from the verification run)
| Field | Value |
|---|---|
| Winner | Provider C |
| Settled amount | **34 USD.demo** — a self-issued **demo voucher**, *not* real currency / not a stablecoin / not Canton Coin |
| **Settlement contract id** | `002b277491de20858b6d1ff8f583643027f2bca77c90d950e9e3accc39b9dc7055ca1212208474cc1018fe1008c5af3503934112e17cfd7e57b21572eb25c7ec6736684a39` |
| **Payment IOU contract id** | `005beb3a90c5d3d706d45e09cc39b0e683cc21848a3186b175f56a3fd21238cad0ca121220ff8505ed4f738409f35c531adfd1d97de77039814e6e8d3066cded06a84c5fb2` |

**Parties on devnet** (party ids are public evidence; all hosted on the validator's namespace):
```
Buyer      Tacit43kfBuyer::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
Provider A Tacit43kfProviderA::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
Provider B Tacit43kfProviderB::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
Provider C Tacit43kfProviderC::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
Auditor    Tacit43kfAuditor::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
```

> Each run settles a **new** deal, so contract ids differ per run — re-verifying produces fresh ids, all on the same devnet package.

## The 11 privacy invariants (all passed live on devnet)
1. Settlement visible to buyer + winner
2. Public cannot see the winner
3. Losing Provider A cannot see the settlement
4. Losing Provider B cannot see the settlement
5. Provider A's sealed price visible to itself + buyer only
6. Provider B's sealed price visible to itself + buyer only
7. Provider C's sealed price visible to itself + buyer only
8. No provider (or auditor, or public) can see a competitor's sealed price
9. Auditor **can** verify the settled amount (oversight)
10. Auditor **cannot** see the payment IOU id (no surveillance)
11. Payment IOU visible to buyer + winner only

Every field's visibility is **read back from real per-party devnet queries** (`read.ts`), not asserted by app code.

## Reproduce it yourself (~60–90s)
```bash
# 1) The public app is on devnet — confirm mode:
curl -s http://80.225.209.190:3200/api/health        # → "mode":"devnet","reachable":true

# 2) Run the end-to-end privacy proof against the live app (settles a real devnet deal):
APP_URL=http://80.225.209.190:3200 node scripts/preflight-e2e.mjs --require-ledger
#   → prints all 11 invariants + a fresh EVIDENCE block (settlement id, IOU id, winner, amount)
```
`--require-ledger` **fails** (non-zero) if the app is in DEMO FALLBACK — so a pass proves devnet mode + a ledger-backed settlement, not a simulation.

## Limitations (honest)
- **`USD.demo` is a self-issued demo voucher**, not real money, not a stablecoin, not Canton Coin. Real value settlement is roadmap.
- **The three provider bidders are app-operated** (run inside the app, deterministic or LLM-assisted) — they are *not* independent external services. The genuinely-external-agent path is **MCP** (an outside Claude agent transacting as its own Canton party).
- **The public URL is HTTP-only** (no TLS) on port 3200.
- Devnet resets on the network's schedule; parties/packages may need re-bootstrapping after a reset (`npm run devnet:bootstrap`).
