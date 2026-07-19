// Tacit — PURE spending-mandate logic (browser + node safe, no I/O). The ledger
// reads/writes live in app/lens/ledger/mandate.ts; this file holds the flag check,
// the read-only pre-check, eligible-mandate selection, and idempotent-authorization
// resolution — all pure and unit-testable.

export const MANDATE_INSUFFICIENT = 'MANDATE_INSUFFICIENT';

/** A SpendMandate as read from the ledger (payload, normalized). */
export interface MandateView {
  contractId: string;
  principal: string;
  agent: string;
  label: string;
  currency: string;
  limit: number;
  remaining: number;
  allowedServices: string[]; // [] = unrestricted
  expiresAtUtc: string | null; // ISO or null
}

/** A SpendAuthorization as read from the ledger. */
export interface AuthorizationView {
  contractId: string;
  jobId: string;
  amount: number;
  serviceType: string;
  authorizedAtUtc: string;
}

/** The feature flag. Off (or unset) = today's behavior, bit-for-bit. */
export function mandateEnabled(env: Record<string, string | undefined>): boolean {
  return (env.TACIT_MANDATE_MODE || 'off').toLowerCase() === 'on';
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const notExpired = (m: MandateView, nowIso: string): boolean => !m.expiresAtUtc || nowIso <= m.expiresAtUtc;
const coversService = (m: MandateView, serviceType: string): boolean => m.allowedServices.length === 0 || m.allowedServices.includes(serviceType);

/**
 * Choose the mandate to spend against: the agent's active, unexpired mandate that
 * permits this service and has the most remaining budget. Deterministic (ties broken
 * by contractId). Returns null if none qualifies.
 */
export function pickEligibleMandate(mandates: MandateView[], serviceType: string, nowIso: string): MandateView | null {
  const eligible = mandates.filter((m) => notExpired(m, nowIso) && coversService(m, serviceType));
  if (eligible.length === 0) return null;
  return eligible.slice().sort((a, b) => (b.remaining - a.remaining) || (a.contractId < b.contractId ? -1 : 1))[0];
}

export type Precheck =
  | { ok: true; mandate: MandateView }
  | { ok: false; code: string; reason: string };

/**
 * Read-only pre-check BEFORE any ledger write: an eligible mandate must exist,
 * be unexpired, permit the service, and have remaining >= the ceiling (maxBudget).
 * Returns MANDATE_INSUFFICIENT with a human reason otherwise — the procurement
 * then fails with zero ledger writes.
 */
export function precheckMandate(mandates: MandateView[], maxBudget: number, serviceType: string, nowIso: string): Precheck {
  const active = mandates.filter((m) => notExpired(m, nowIso));
  if (active.length === 0) {
    return { ok: false, code: MANDATE_INSUFFICIENT, reason: mandates.length === 0 ? 'No spending mandate has been granted to this agent yet.' : 'The standing spending mandate has expired.' };
  }
  const forService = active.filter((m) => coversService(m, serviceType));
  if (forService.length === 0) {
    return { ok: false, code: MANDATE_INSUFFICIENT, reason: `No standing mandate permits ${serviceType}.` };
  }
  const m = pickEligibleMandate(forService, serviceType, nowIso)!;
  if (num(m.remaining) < maxBudget) {
    return { ok: false, code: MANDATE_INSUFFICIENT, reason: `This mandate has ${m.remaining} demo credits remaining, below the ${maxBudget} ceiling for this job.` };
  }
  return { ok: true, mandate: m };
}

/**
 * Idempotent-authorization resolution: on a resumed job, if an authorization for
 * this jobId already exists, return it — the orchestrator must NOT authorize again
 * (double-spend guard). Returns null if none exists yet.
 */
export function findExistingAuthorization(auths: AuthorizationView[], jobId: string): AuthorizationView | null {
  return auths.find((a) => a.jobId === jobId) || null;
}
