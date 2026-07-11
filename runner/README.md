# Tacit provider runner

A **standalone, long-running provider process** — not part of Next.js. Each runner:

1. **discovers** invited `ActiveWorkRequest`s from Canton (as its own provider party — it's an observer),
2. **prices** the job with its **private local policy** (base cost + margin + request complexity + local load) — never a shared multiplier, never returned to the buyer, never placed on-ledger,
3. **creates its own `SealedBid`** directly on Canton as Provider A/B/C,
4. **never** receives a competitor's bid or a price from the buyer,
5. polls its `Assignment`; **only if it won**, runs the real **`site_audit`** and submits the exact canonical report bytes + their SHA-256 through the `Assignment.SubmitDelivery` choice.

There is **no** call to the app's internal `negotiateCore` / `providerAgent`, no buyer-supplied price, and no hardcoded winner.

## Run
```bash
npm install && npm run build
npm test                       # canonical / SSRF / real site_audit self-test
# one process per provider, each with its own env file:
env $(grep -v '^#' runner-A.env | xargs) node dist/index.js
```
Health (loopback only): `curl http://127.0.0.1:$RUNNER_HEALTH_PORT/health` → `{ ready, instanceId, pid, provider, label, partyShort, ledgerMode }` (no secrets).

## Honest disclosure
The three runners are **separate autonomous processes with distinct Daml parties**, but they share **one hosted-validator OAuth credential** (5North issued a single machine credential with `CanActAs` on all three parties) — **not** separate validator operators or independently-credentialed institutions. `USD.demo` is a demo voucher, not real money. `site_audit` is the first real service adapter; SSRF protections (HTTPS+:443 only, private/loopback/metadata IP rejection, redirect re-validation, timeouts, byte caps) are enforced and tested.
