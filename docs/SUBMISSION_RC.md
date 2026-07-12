# Tacit — submission release candidate

## Second real service: `web_performance_probe` — a new vertical, zero Daml changes (2026-07-12)

Tacit is now a **two-market** exchange. Alongside vendor security, buyers can hire the
same three provider agents for a **real web-performance measurement** — and this second
market was added with **zero changes to the ledger model and zero new runtime
dependencies**. Both services ride the *same frozen* `tacit-work` template; only
`serviceType`, `serviceInput`, and `reportJson` differ.

- **What the winner really does:** resolves the target with **SSRF-hard, IP-pinned**
  networking, negotiates HTTP version via **ALPN**, and takes **5 timed samples**
  (connect / TLS / TTFB / total, byte-capped) over fresh sockets. The report carries
  per-sample numbers, min/median/max aggregates, transfer + caching posture, redirect
  chain, findings, and a banded score.
- **Determinism contract (identical to vendor):** the **score is a pure function of the
  report** — every point is a line in `scoringBreakdown`. On acceptance the buyer
  **recomputes the score from that breakdown** and rejects any mismatch, exactly as it
  re-hashes the committed bytes. Timings are honest and vary; the *score* does not.
- **Service-scoped policy:** `latency-slo-standard-v1` (default) / `latency-slo-strict-v1`.
  `evaluatePolicy` dispatches by `report.service`; a policy from the wrong service is a
  **precise error** ("standard-saas-v1 is not valid for service web_performance_probe"),
  and `validateAgentPlan` refuses a cross-service policy up front.
- **Every buyer surface:** `/work` service selector (vendor | performance) with a
  perf `PerformanceSection` (aggregates, per-sample TTFB bars, transfer/caching chips);
  the agent planner picks the service **by intent**; MCP gains `tacit_probe_performance`
  (v0.5.0). **No LLM anywhere** in measurement, scoring, or policy.
- **Proven live on devnet (example.com):** HTTP/2 · median TTFB **452 ms** · band
  **fast** · score **100** · **0** findings · policy `latency-slo-standard-v1` →
  **approve** · winner providerC @ **21.76 USD.demo** · `providerCommittedSha256 ==
  buyerComputedSha256` `d391208e…`. `preflight:probe` **29/29**, vendor regression
  `preflight:agentic` **35/35** — no fallback, no Daml change.
- **Verify:** `APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-probe.mjs --require-ledger --require-runners`.
  `npm run demo:check` now asserts **both** services at a 3-runner quorum.

---



## Buyer Agent Console — a real LLM procurement agent (2026-07-12)

`/work` is now **console-first**: an **Agent** tab (default) where you describe an
onboarding in plain English, plus the full **Manual** form (preserved). The LLM has
**exactly two touchpoints, both OFF the work path**:

1. **Plan** — `POST /api/agent/plan {goalText}` asks a server-side, env-configured
   OpenAI-compatible model to return strict JSON `{serviceType, input:{url}, policyId,
   maxBudget, confidence, assumptions[]}`. This is a **proposal only** — nothing is
   spent. `validateAgentPlan` (pure, in `shared/services.ts`) is the **hard gate**: it
   re-checks service registration + availability quorum, the https/SSRF input validator,
   the policy id, and budget bounds, and **fails closed** on anything else. The human
   approves the resulting **mandate card**, which then calls the real, no-fallback
   `/api/work/procure` (`requestSource:"console"`).
2. **Brief** — `POST /api/agent/brief {workResult}` asks the model, grounded on ONLY a
   projection of the **already-verified** WorkResult, for a ≤120-word plain-English
   explanation. It cites nothing not in the JSON and **decides nothing** — `evaluatePolicy`
   remains the only decision-maker. Rendered above the verified sections, labeled
   "Agent brief — generated; verified data below."

**Honest failure:** if the LLM is unconfigured, times out, or returns garbage, `/plan`
returns `{ok:false, reason}` (never a fabricated proposal) and the user sees the Manual
form; `/brief` returns `{ok:false}` and the verified result stands alone. The LLM never
invents findings, scores, prices, or decisions. During procurement, agent-voiced
narration is keyed **deterministically** to real ledger stage transitions (no LLM, no
timers). The console and MCP `tacit_assess_vendor` are the same buyer path, two clients.

- **New env (add to `~/tacit-devnet.env`; server-side only, never in the client bundle):**
  `TACIT_LLM_PROVIDER`, `TACIT_LLM_MODEL`, `TACIT_LLM_API_KEY`, `TACIT_LLM_BASE_URL`.
  Falls back to the existing `GRADIENT_*` config, so it deploys without re-provisioning.
- **Verified:** `npm run preflight:console` (plan fails closed on hostile inputs incl.
  prompt-injection + SSRF; agents fail honestly without a key; a real `requestSource=console`
  procurement completes with the deterministic policy + buyer verification). Plan-validator
  unit tests in `npm run test:services`. Frozen Daml unchanged.

---



## submission-rc2 — agentic vendor-security product (2026-07-12)

Tacit is now **a private work exchange for software agents, launching with vendor
security.** An external MCP agent (or the `/work` UI) hires three competing provider
agents; the winner performs a **real passive vendor-security assessment**; the buyer
verifies (hash + schema + target + score) and a deterministic policy decides; an
auditor gets the receipt, not the report. Frozen Daml packages unchanged.

- **Live:** https://tacit.80-225-209-190.sslip.io/work · MCP `tacit_assess_vendor`.
- **Proven live on devnet (through HTTPS):** agentic vendor e2e **35/35** + original
  privacy **11/11**, no fallback. Manifest: [verification-manifest.json](verification-manifest.json) (168 assertions across 9 suites — two live services).
- **Fresh live evidence (example.com):** real TLSv1.3 / Cloudflare cert / 48d · score
  59 "weak" · 8 findings · policy `standard-saas-v1` → **human_review** (score:59) ·
  winner providerC @ 20.77 USD.demo · `providerCommittedSha256 == buyerComputedSha256`
  `4145de81…` · settlement `00897135…` · receipt `005fd6e9…`.
- **Verify:** `APP_URL=https://tacit.80-225-209-190.sslip.io node scripts/preflight-agentic.mjs --require-ledger --require-runners`.
- **New since rc1:** registered-service registry (`shared/services.ts`), real
  `vendor_security_assessment` adapter (passive, SSRF-hard, IP-pinned), autonomous
  provider dispatch, buyer acceptance hardening + deterministic policy engine, MCP
  `tacit_list_services`/`tacit_assess_vendor`, agentic `/work` + landing, read-only
  ledger-derived `/api/work/status`. Honest limitations below still apply; `site_audit`
  retained for resumption only.

---



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
- **Two real service adapters** ship: `vendor_security_assessment` and
  `web_performance_probe`. `site_audit` is retained for resumption/back-compat only.
  Both real services are **passive/read-only** against the target (no auth, no writes).
- Historical (already-accepted) report bodies are **not reconstructed** by the active-contract reader —
  a resumed job honestly reports this; fresh runs show the full report.
