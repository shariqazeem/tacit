# Tacit Work — live devnet evidence

**What this proves:** three *separately-running* provider processes discover a
work request from Canton, **each bids as its own Daml party** (no shared price, no
central bid generation), the buyer awards + prepays the lowest bid, the **winner
performs a real website due-diligence audit** and delivers it privately, and the
buyer **recomputes the SHA-256 off-ledger** before accepting — producing an
auditor-visible receipt that reveals *no* report contents.

Captured against the **real Canton devnet** (5North hosted validator, v2 JSON
Ledger API) by `scripts/preflight-work-e2e.mjs --require-ledger --require-runners`.
Re-runnable: `npm run preflight:work` with 3 runners + the app in `devnet` mode.

## Run — 2026-07-11T16:46:02Z · mode `devnet` · **28/28 invariants ✅**

| Fact | Value |
|---|---|
| Frozen core package (`tacit`, SDK 3.4.11) | `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` — **unchanged** |
| Work package (`tacit-work`, data-dependency on frozen `tacit`) | `9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed` |
| Buyer party | `Tacit43kfBuyer::1220a14c…` |
| Provider parties (A / B / C) | `Tacit43kfProviderA/B/C::1220a14c…` |
| Auditor party | `Tacit43kfAuditor::1220a14c…` |

### Three distinct runner processes
| Runner | Instance id | PID | Party |
|---|---|---|---|
| Provider A | `providerA-22819` | 22826 | `…ProviderA::1220a14c` |
| Provider B | `providerB-22819` | 22827 | `…ProviderB::1220a14c` |
| Provider C | `providerC-22819` | 22828 | `…ProviderC::1220a14c` |

### Sealed bids (each created on-ledger by its own runner)
| Provider | Price (USD.demo) | `SealedBid` contract id |
|---|---|---|
| Provider A | 32.81 | `001d13092bb443b907347354375771da65563fc40ba1324c0fc02a0bf23710d87e…` |
| Provider B | 47.94 | `00db03164b6fc87302a1d49be9310f54a4767dde28dc046f89fdcae986684afd89…` |
| **Provider C (winner)** | **19.78** | `00bd21c18dd86951f5ba015d9d44c2fe2f4e7ffb06fc999edd4017c69ff1cab06b…` |

Prices differ because each runner priced with its **own private policy** (base
cost + margin + request complexity + local load) — never a shared multiplier,
never returned to the buyer, never placed on-ledger.

### Lifecycle contracts
| Step | Contract id |
|---|---|
| `Settlement` (award + prepay) | `00fd2ee95802a22d3b9dd0fdc4fe12f6dd939adcdc8b89baae2cf5c73dd424bde1…` |
| Payment `Iou` (USD.demo 19.78) | `006ce6cda86977e4519f9b9cc296fdbd95877941cd77425858e1354001131c54db…` |
| `Assignment` | `00de4e2331bc0b37ab7785d3142b4dc88fc58a47ead68da3ffcc94071509a1dc8b…` |
| `PrivateDelivery` (buyer + winner only) | `009aedc20cd8e47e73cacc69546e5824b05f4e1816ecadddc60534749fefaea891…` |
| `DeliveryReceipt` (buyer + winner + auditor) | `0045225aa71ff4f9b68a97ccafb8ed56b283a62e593ceb58efa9c5cc3c1ce8d9bd…` |

### The real service (`site_audit`)
| Field | Value |
|---|---|
| Requested URL | `https://example.com` |
| Final URL (after validated redirects) | `https://example.com/` |
| Observed HTTP status | **200** |
| Measured latency | **440 ms** |
| Artifact size | **632 bytes** |
| Provider commitment (on-ledger SHA-256) | `2b0a5bd658d77680037bcbc927ab574a0e98d667332dbfd3e55bbc2591a7d616` |
| **Buyer recomputed SHA-256 (off-ledger)** | `2b0a5bd658d77680037bcbc927ab574a0e98d667332dbfd3e55bbc2591a7d616` ✅ **match** |

## Invariants asserted (all ✅)
- **Runners:** ≥3 ready, **distinct** instance ids + PIDs, all on devnet.
- **Bidding:** exactly 3 bids, from **3 distinct provider parties** mapping to the
  three invited providers, each with a real contract id.
- **Settlement:** award + prepay produced a `Settlement` + payment `Iou`.
- **Artifact:** report is a `site_audit` of the requested URL with a real HTTP
  status, measured latency, and security-header checks — **buyer re-hash == the
  on-ledger commitment**, byte length matches, off-ledger verification passed
  *before* `Accept`.
- **Privacy:** receipt visible to buyer + winner + auditor, **not** to a losing
  provider; the private delivery (the report body) is visible to the buyer,
  **not** to the auditor, **not** to a losing provider.
- **Tamper:** a one-byte change yields a different SHA-256 → the buyer would
  refuse to `Accept` (no receipt for a tampered delivery).
- **Idempotency:** replaying the same `jobId` reuses the **same** settlement and
  receipt (no second award/payment) and is flagged `resumed`.

## Honest disclosure
- The three runners are **separate autonomous processes with distinct Daml
  parties**, but they share **one hosted-validator OAuth credential** (5North
  issued a single machine credential with `CanActAs` on all parties) — **not**
  separate validator operators or independently-credentialed institutions.
- `USD.demo` is a **demo voucher**, not real money, Canton Coin, or a stablecoin.
- `site_audit` is the **first real service adapter**. Daml proves *who can see
  what*, *that payment happened*, and *that a commitment was made* — it does **not**
  prove the SHA-256 matches the bytes; the **buyer** proves that off-ledger and
  refuses to accept on mismatch (see the tamper invariant).
- SSRF protections (HTTPS + :443 only, private/loopback/link-local/metadata IP
  rejection, redirect re-validation, timeouts, byte caps) are enforced and tested.
