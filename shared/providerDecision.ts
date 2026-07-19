// Tacit Phase 2 — PURE provider decision engine. A provider is no longer a price function that
// always bids: it inspects each request against its OWN private policy (capabilities, capacity,
// minimum margin, deadline) and returns BID / DECLINE / NEED_CLARIFICATION. Independent per provider.
//
// Proof 2: a provider declines a request it can't/won't serve (capacity or margin). Proof 3: three
// providers with different private policies compute different prices from the same request. Nothing
// here is ever shown to the buyer or another provider — it's the provider's private reasoning.

import type { ProviderPolicy, ProviderDecision, AgentServiceType } from './agentCore';

export const LOAD_COEF = 0.15; // mirrors runner/src/pricing.ts

export interface DecisionRequest {
  serviceType: string;
  serviceInput: string; // the request target/input (an https URL for our services)
  budget: number;       // the buyer's per-task ceiling for this request
  inFlight: number;     // this provider's REAL current load (won-open + pending bids)
  deadlineSec?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The provider's private quote — base(service) × (1 + its margin) × request complexity × live load,
 *  clamped to [base, 98% of the buyer's ceiling]. Pure; differs per provider by its cost + margin. */
export function quote(policy: ProviderPolicy, req: DecisionRequest): number {
  const base = policy.serviceCost[req.serviceType] ?? policy.baseCost;
  const complexity = 1 + Math.min(0.5, (req.serviceInput || '').length / 2000);
  const load = 1 + Math.max(0, req.inFlight) * LOAD_COEF;
  const raw = base * (1 + policy.minMargin) * complexity * load;
  return round2(Math.max(base, Math.min(raw, req.budget * 0.98)));
}

/** Rough private ETA (seconds) from the service's base cost + current load. */
function eta(policy: ProviderPolicy, req: DecisionRequest): number {
  const base = policy.serviceCost[req.serviceType] ?? policy.baseCost;
  return Math.round(15 + base * 0.6 + Math.max(0, req.inFlight) * 8);
}

/**
 * The provider's private decision. Order: capability → clarity → capacity → margin floor → bid.
 * Deterministic given (policy, request, live load) — the same inputs always yield the same verdict.
 */
export function decide(policy: ProviderPolicy, req: DecisionRequest): ProviderDecision {
  // 1. Can I even do this work?
  if (!policy.capabilities.includes(req.serviceType as AgentServiceType)) {
    return { verdict: 'DECLINE', price: null, etaSec: null, reasonCode: 'unsupported_service' };
  }
  // 2. Is the request well-formed enough to act on?
  if (!req.serviceInput || !/^https:\/\//i.test(req.serviceInput)) {
    return { verdict: 'NEED_CLARIFICATION', price: null, etaSec: null, reasonCode: 'need_target' };
  }
  // 3. Am I at capacity?
  if (req.inFlight >= policy.capacity) {
    return { verdict: 'DECLINE', price: null, etaSec: null, reasonCode: 'capacity_full' };
  }
  // 4. Does the buyer's ceiling clear my minimum margin?
  const base = policy.serviceCost[req.serviceType] ?? policy.baseCost;
  const floor = base * (1 + policy.minMargin);
  if (req.budget * 0.98 < floor) {
    return { verdict: 'DECLINE', price: null, etaSec: null, reasonCode: 'below_min_margin' };
  }
  // 5. Bid.
  return { verdict: 'BID', price: quote(policy, req), etaSec: eta(policy, req), reasonCode: 'ok' };
}
