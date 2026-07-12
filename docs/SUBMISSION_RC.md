# Tacit — submission release candidate

**Cut:** 2026-07-12 (UTC) · **tag:** `submission-rc1` (on `main`) · **prior product tag:** `work-phase1b-product`

Judge-operable, HTTPS, live on the real Canton devnet. This document is the single
source of truth for the submission.

## Public URLs (HTTPS, publicly-trusted certificate)
| What | URL |
|---|---|
| Product story (landing) | https://tacit.80-225-209-190.sslip.io |
| **Tacit Work** (run a real private procurement) | https://tacit.80-225-209-190.sslip.io/work |
| Ledger Lens (per-party privacy) | https://tacit.80-225-209-190.sslip.io/lens |
| Work readiness | https://tacit.80-225-209-190.sslip.io/api/work/health |
| Health | https://tacit.80-225-209-190.sslip.io/api/health |
| Repo | https://github.com/shariqazeem/tacit |
| Emergency origin (NOT judge-facing) | http://80.225.209.190:3200 |

## TLS
- **Hostname:** `tacit.80-225-209-190.sslip.io` (durable IP-derived DNS via sslip.io → 80.225.209.190).
- **Issuer:** Let's Encrypt (R/YE intermediate). **SAN:** `tacit.80-225-209-190.sslip.io`.
- **Validity:** 2026-07-12 → **2026-10-10**. **Renewal:** certbot systemd timer (auto).
- **Redirect:** `http://…` → `https://…` (301). **Trust:** external `curl` TLS verify = 0. **Mixed content:** none.
- **Proxy:** nginx vhost `tacit` → `http://127.0.0.1:3200` (300s read/send timeouts for the long work flow; `/api/*` uncached). Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`. No HSTS on the shared parent.

## Packages (frozen, unchanged)
- **Core `tacit`:** `fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff` (Daml 3.4.11).
- **Work `tacit-work`:** `9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed` (data-dependency on the frozen core).

## Live evidence — fresh work run through HTTPS (2026-07-12T01:49:04Z)
- **Mode:** `devnet` · **provider runners:** 3 ready, distinct instances + PIDs (`providerA/B/C-vm`).
- **Parties:** Buyer + Provider A/B/C + Auditor, all `Tacit43kf…::1220a14c…`.
- **Sealed bids:** A `42.18`, B `61.63`, **C `19.78` (winner)** USD.demo — each priced by its own private policy.
- **Settlement:** `003f630bf0c21c495360b7aa3378246d7fc4fa8ab0a67f8f49003ec9fc9a421202…`
- **Payment IOU:** `00698adee2232d28a98f0f7dae5b2f92ef6a6d7bc2060066c91b530b4c36292717…` (`19.78 USD.demo`)
- **Assignment:** `0049f89575f964792000247b2ec71f748afc0ef958f05f3fda8f9d591ce85714f1…`
- **Private delivery:** `008538352c85328cd77ec9e6dab5f9609c399653b35d50cbefcdad0259d4fcd4a5…`
- **Delivery receipt:** `006d899ac2480f154521d2c64cd93d4cce01a7be47218ac294d5189403e3918478…`
- **Audit:** `https://example.com` → HTTP **200**, **27 ms**, score **40**, **631-byte** artifact.
- **Buyer SHA-256 (off-ledger) == on-ledger commitment:** `53974c1aef5267af215cf703ead98050cc41473b216e762034861378eb412372` ✅
- **Original privacy proof:** 11/11. **Work proof:** 48/48. **No fallback** in either.

> Note: Phase-1A/1B evidence in `docs/WORK_EVIDENCE.md` / `docs/DEVNET_EVIDENCE.md` was captured
> before HTTPS (over the raw-IP origin); the contract ids there are historical and still valid.

## Verify it yourself (through HTTPS)
```bash
# read-only readiness (no ledger job):
npm run demo:check
# real work run — 48/48 (bids, award+prepay, audit, delivery, buyer hash, receipt, tamper, idempotent):
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-work-e2e.mjs --require-ledger --require-runners
# original 11 privacy invariants:
APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-e2e.mjs --require-ledger
```

## Deployment state (no private paths)
- `tacit.service` — active (Next.js app on `127.0.0.1:3200`, mode `devnet`).
- `tacit-runner-a` / `-b` / `-c` — active (loopback health `127.0.0.1:7011/7012/7013`).
- `nginx` — active (adds only the `tacit` vhost; `kyvernlabs` / `sage` / `kyvern-commerce` untouched).
- Other user services on ports **3000/3001** were **not touched**.
- **VM app source matches** the tagged public `main` (sha256 of key files verified equal).

## Rollback (does NOT touch the ledger or runners)
1. **App code:** `git -C ~/tacit-app` is a copy, not a repo — to roll back, re-sync the previous tag
   (`work-phase1b-product`) from GitHub and rebuild, or restore the kept build: `~/tacit-app/.next.bak.phase1b`.
2. **Restart:** `sudo systemctl restart tacit.service` (service-scoped; runners keep running).
3. **Proxy:** to revert HTTPS, `sudo rm /etc/nginx/sites-enabled/tacit /etc/nginx/conf.d/tacit-upgrade.conf && sudo nginx -t && sudo systemctl reload nginx` (the cert stays installed harmlessly).
4. **Emergency origin:** `http://80.225.209.190:3200` remains live throughout.
5. **Post-rollback checks:** `npm run demo:check` (read-only) + `curl -s http://80.225.209.190:3200/api/work/health`.

## Honest limitations
- Three runners are **separate processes with distinct Canton parties** but share **one** hosted-validator
  OAuth credential — **not** separate validators or organizations.
- `USD.demo` is a **demo voucher** — not real money, a stablecoin, or Canton Coin.
- The buyer acts through the **pinned buyer party**; a `buyerLabel` is a display label only.
- Hash matching is performed by the **buyer application off-ledger**; the Receipt records acceptance of
  committed bytes, **not** objective report quality. Canton did not verify the report's correctness.
- **`site_audit` is the only service adapter.**
- Historical (already-accepted) report bodies are **not reconstructed** by the active-contract reader —
  a resumed job honestly reports this; fresh runs show the full report.
