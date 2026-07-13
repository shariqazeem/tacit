// Tacit runner — PRIVATE pricing policy, extracted pure so it is unit-testable and
// deterministic. Nothing here is ever returned to the buyer, placed on Canton, or
// exposed via the health endpoint. No randomness anywhere: a quote is a pure function
// of (per-service cost policy, request complexity, real current workload).

export interface CostPolicy {
  baseCost: number; // fallback base cost when a service has no specialized cost
  margin: number;
  serviceCost: Record<string, number>; // per-service base cost (specialization)
}

// Load surcharge per unit of real in-flight work. Chosen so a single concurrent
// same-service job (in-flight = 1) lifts a quote by ~15% — enough to plausibly flip
// a modest specialist spread, without runaway inflation.
export const LOAD_COEF = 0.15;

/**
 * REAL current workload for this runner, recomputed LIVE from the ledger each tick
 * (never from an accumulating counter):
 *   • won-but-undelivered  — Assignments naming this runner that it has not delivered
 *   • pending bids         — this runner's own bids on requests STILL awaiting award
 *                            (the ActiveWorkRequest is still active)
 * A bid that was LOST has its ActiveWorkRequest consumed on award and yields no
 * Assignment for this runner, so it appears in NEITHER set and clears from load
 * immediately. This is the fix for the phantom-load bug (old model counted every bid
 * ever placed, so losers inflated without bound). At zero in-flight the quote is
 * exactly the base policy price.
 */
export function computeInFlight(
  deliveries: Record<string, string>,
  ownBidJobIds: string[],
  openAwrJobIds: string[],
  myAssignmentJobIds: string[],
): number {
  const wonOpen = myAssignmentJobIds.filter((j) => !deliveries[j]).length;
  const openSet = new Set(openAwrJobIds);
  const pendingBids = ownBidJobIds.filter((j) => openSet.has(j)).length;
  return wonOpen + pendingBids;
}

/**
 * Deterministic private quote: per-service base cost × (1 + margin) × request
 * complexity × live load, clamped to [base, 98% of budget]. Zero in-flight → the
 * base policy price (load factor exactly 1). Purely a function of its inputs.
 */
export function quotePrice(policy: CostPolicy, serviceType: string, serviceInput: string, budget: number, inFlight: number): number {
  const base = policy.serviceCost[serviceType] ?? policy.baseCost;
  const complexity = 1 + Math.min(0.5, (serviceInput || '').length / 2000); // real signal from the request
  const load = 1 + Math.max(0, inFlight) * LOAD_COEF;
  const raw = base * (1 + policy.margin) * complexity * load;
  const clamped = Math.max(base, Math.min(raw, budget * 0.98));
  return Math.round(clamped * 100) / 100;
}

/**
 * Parse RUNNER_SERVICE_COST_JSON (per-service base cost overrides). Malformed input
 * is safely ignored — logged once via `warn`, falls back to {} (i.e. RUNNER_BASE_COST).
 * Only finite positive numbers are accepted.
 */
export function parseServiceCost(raw: string | undefined, warn: (m: string) => void): Record<string, number> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not a JSON object');
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch (e) {
    warn(`RUNNER_SERVICE_COST_JSON ignored (malformed): ${(e as Error).message}`);
    return {};
  }
}
