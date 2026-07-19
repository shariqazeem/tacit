# Tacit — Final Night Build Log (2026-07-19 → 20)

Goal: one coherent, premium, judge-completable-in-90s product. Preserve the Canton core.
Baseline: main @ fbd829c, tree clean, tsc clean, frozen daml 0-diff.

## Checkpoints (execute in order)

- [ ] **C1 — Shell + landing story.** Simplify TopBar nav (drop 4 equal tabs → "How it works · Live
  proof" + primary CTA "Run a private assessment"). Hero: eyebrow PRIVATE PROCUREMENT ON CANTON,
  headline "Give your AI agent a budget. It hires the best specialist—privately.", supporting line,
  primary CTA → /work, secondary "See a completed Devnet run" → /market. Live-proof strip (Canton
  Devnet live · 3 agents online · N completed jobs · Daml-enforced). One vendor-approval story up top.
- [ ] **C2 — Unified /work journey.** Inline "Create your private workspace" (no /wallet detour) via
  the existing account API. Budget pill in header → /wallet. Default Agent; Manual under Advanced.
  "What do you need to decide?" + business-outcome chips. Agent plan card + autonomy line + single
  "Approve mandate & start" confirmation.
- [ ] **C3 — Running + result + privacy hierarchy.** Rename running stages to the 7 named concepts
  (ledger-derived, no fake timers). Result: decision-first (APPROVE/CONDITIONAL/HUMAN REVIEW/REJECT),
  explanation, 3 findings, spent-vs-max, winner, verified status, recap; move SHA/contract-ids into an
  "On-ledger proof" disclosure; inline "Who can see what?" from real snapshots. Align MandateRefusal +
  Throttle copy.
- [ ] **C4 — Wallet/market/lens context.** /wallet = Budget & identity; demote Canton Coin to an
  "Experimental network rail" disclosure. /market + /lens get a clear CTA back to /work.
- [ ] **C5 — Responsive + a11y + error states.** 375/768/1440; keyboard focus; reduced motion; no
  overflow; every empty/404/error routes to the primary action.
- [ ] **C6 — Verify + deploy.** typecheck/build/unit; Daml byte-identical; real-path exercise; deploy
  Tacit only; health-check; docs updated to shipped truth.

## Guardrails (frozen)
Daml/DARs/package-ids/award+mandate semantics/runner identity/ledger adapter = frozen. No synthetic
data. USD.demo stays explicit. Auth precedes award; not atomic-together. SSRF/idempotency/throttle/
privacy preserved. No new package/db/token. Secrets never printed. kyvern/sage untouched.

## Progress
(updated as checkpoints land)
