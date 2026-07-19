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

## Progress — SHIPPED (deployed live, verified)

- [x] **C1 — Shell + landing.** Nav simplified (How it works · Live proof + one "Run a private
  assessment" CTA, shown on every page but /work). Hero: PRIVATE PROCUREMENT ON CANTON / "Give your
  AI agent a budget. It hires the best specialist—privately." + vendor story + primary CTA → /work,
  secondary → completed Devnet run. LiveStrip → restrained real-data row (Canton Devnet live · N
  agents · N completed · Daml-enforced). *Commit c…*
- [x] **C2 — Unified /work.** Inline "Create your private workspace" (no /wallet detour, real account
  API). Header budget pill → /wallet. "What do you need to decide?" + business-outcome examples.
  Manual under an Advanced disclosure. MandateCard → "Agent plan" + autonomy line + single "Approve
  mandate & start". Verified end-to-end locally (account mint → composer + budget pill).
- [x] **C3 — Result + running hierarchy.** Running stages → the ledger-derived concepts. Decision hero
  gains outcome summary (winner · spent vs budget-left · verified). Raw hashes/contract-ids collapsed
  into an "On-ledger proof" disclosure (full copyable evidence kept). SuccessRecap → compact "What
  Tacit did".
- [x] **C4 — Context.** Canton Coin demoted to an "Experimental network rail" disclosure in /wallet.
  /market + /lens route back to /work via the nav CTA.
- [x] **C5 — Responsive/a11y.** Verified no horizontal overflow at 375 on landing + /work; 1440 polished;
  reduced-motion preserved; 404 styled + routes to primary action.
- [x] **C6 — Verify + deploy.** tsc clean · 5 unit suites green (mandate 8, services 28, work 18, market
  13, planner 5) · frozen daml **0-diff** · production build green · deployed to VM (rsync + rebuild +
  restart tacit.service only) · all live routes 200, health ok, 46 real completed jobs, kyvern/sage
  untouched.

### Gotcha logged
Never run `npm run build` while `next dev` is live — they share `.next` and the build corrupts the dev
server's chunks (MODULE_NOT_FOUND). Fix: stop dev, `rm -rf .next`, restart dev. Source was never broken.

### Honest limitations that remain
- Settlement is a `USD.demo` voucher (real-CC rail is wired but demoted, honestly). Authorization
  precedes award; they are sequential, not atomic-together. Full-job ~11-write bursts can still 503 on
  the shared 5North validator cap → the honest ThrottleView; single writes (account, top-up, tap) work.
