# Mandate activation runbook — run the moment devnet writes recover

**Why this exists.** The on-ledger spending-mandate feature (`tacit-mandate`) is committed,
flag-gated **OFF**, and dormant. Activation needs devnet **writes** (DAR upload + party
allocation + one `SpendMandate` create), and the shared 5North validator has been
rate-limiting writes from our credential (HTTP 403 "security-sensitive" / PERMISSION_DENIED).
The single probe on `2026-07-19` was **still throttled**. This runbook is the exact ~15-minute
sequence to run **on the VM** (where the devnet credentials live) once writes recover — zero
thinking required.

## Preconditions (all already true)
- Pass 7 is on `main` (commits `292f534`..`8e7dc2b`) and the tree is clean.
- `tacit-mandate` DAR is built: `tacit-mandate/.daml/dist/tacit-mandate-0.1.0.dar`
  (package id `f3e2d2a95c64607323929d867b33a365c69c229298aad19e0ef6f537d1154d1a`).
- The VM runs `tacit.service` (port 3200) with `~/tacit-devnet.env` sourced
  (OAuth creds + `TACIT_PARTIES_JSON` with the pinned `Buyer`).

## Recovery check (1 write — do this first, do NOT poll)
```bash
# From anywhere; hits the VM's public API, which submits with the VM credential.
curl -s -X POST https://tacit.80-225-209-190.sslip.io/api/work/procure \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"recheck-'"$(date +%s)"'","serviceType":"vendor_security_assessment","input":{"url":"https://example.com"},"maxBudget":100}' | head -c 300
```
- `"ok":true`  → **writes recovered.** Proceed to B.1.
- `"reason":"LEDGER_WRITE_THROTTLED"` (HTTP 503) → **still throttled.** Stop. Re-check in a few
  hours; do not poll in a loop (polling can extend the throttle).

## Write budget
Assume a ~50-writes/day credential quota. This whole runbook spends **≤ ~14 procurement-
equivalent writes**, leaving **≥ ~35 headroom** for the video recording + judging. **Run each
suite ONCE.** If one fails, read the logs and diagnose before spending another write.

| step | command | ~proc-equiv writes |
|---|---|---|
| B.1 bootstrap | `npm run devnet:bootstrap:mandate` | ~2 (DAR + party + grant + 1 SpendMandate) |
| B.3 mandate preflight | `npm run preflight:mandate -- --deep` | ~4 (2 real jobs + over-limit attempt + TopUp) |
| B.4 market | `npm run preflight:market` | 0 (auditor reads) |
| B.5 agentic/probe/console/e2e | one pass each | ~4 (1 job each; e2e resumes) |
| B.6 demo:prime | `npm run demo:prime` | ~2 (1 job/service) |
| B.7 cold-visitor UI run | one real /work run | 1 |
| **total** | | **~13** |

---

## B.1 — bootstrap the mandate on-ledger  *(on the VM, env sourced)*
```bash
cd ~/tacit && set -a && . ~/tacit-devnet.env && set +a
npm run devnet:bootstrap:mandate
# → prints: mandatePackageId, principal (TacitPrincipal::…), mandateCid, and an env block.
# RECORD all three. It is idempotent — re-running reuses the DAR/party/mandate.
```

## B.2 — flip the flag + restart  *(reads only)*
```bash
# Append to ~/tacit-devnet.env (use the principal party the bootstrap printed):
cat >> ~/tacit-devnet.env <<'ENV'
TACIT_MANDATE_MODE=on
TACIT_MANDATE_PACKAGE_NAME=tacit-mandate
TACIT_MANDATE_PACKAGE_ID=f3e2d2a95c64607323929d867b33a365c69c229298aad19e0ef6f537d1154d1a
TACIT_PRINCIPAL_PARTY=<PASTE TacitPrincipal::… FROM B.1>
ENV
sudo systemctl restart tacit.service
sleep 3
curl -s https://tacit.80-225-209-190.sslip.io/api/mandate/status | head -c 400   # expect ok:true + mandate
```

## B.3 — prove the mandate is real  *(the two video artifacts)*
```bash
cd ~/tacit && set -a && . ~/tacit-devnet.env && set +a
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:mandate -- --deep
# CAPTURE VERBATIM for the video:
#  • the "direct over-limit Authorize … FAILED on the ledger" line + the raw ledger error, and
#  • the before/after `remaining` across a real job (decremented by exactly the winning price).
```

## B.4 — market to 26/26  *(auditor reads; 0 writes)*
```bash
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:market
```

## B.5 — one pass each of the live suites
```bash
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:agentic
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:probe
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:console
APP_URL=https://tacit.80-225-209-190.sslip.io npm run preflight:e2e -- --require-ledger
APP_URL=https://tacit.80-225-209-190.sslip.io npm run demo:check
```

## B.6 — prime the demo (full end-to-end)
```bash
APP_URL=https://tacit.80-225-209-190.sslip.io npm run demo:prime
```

## B.7 — cold-visitor QA (screenshots at 1440)
Landing → **Give agents a job** → first-run strip → tap a goal chip → **Plan the mandate** →
mandate card should now read **"within your standing mandate — X remaining"** → **Approve** →
real run → success recap with the **Spend authorization** evidence row → `/market` shows the
new receipt on top.

## B.8 — record the evidence
- Regenerate `docs/verification-manifest.json`: move `preflight:mandate` from `pending` to a
  counted `pass` (assertions ≈ 12) and bump totals; keep counts monotonic.
- Add the activation evidence (package id / principal / mandate cid, the verbatim over-limit
  refusal, before/after remaining, all suite counts) to `docs/SUBMISSION_RC.md`.
- Commit + push.

## Rollback (instant, no ledger writes)
Set `TACIT_MANDATE_MODE=off` in `~/tacit-devnet.env` and `sudo systemctl restart tacit.service`.
The product returns to bit-for-bit today's behavior; the mandate contracts simply go unread.
