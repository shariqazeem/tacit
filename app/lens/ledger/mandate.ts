// Tacit Mandate — buyer/agent-side ledger reads + the single spend authorization,
// for the standalone `tacit-mandate` package. STRICTLY additive and feature-flagged:
// with TACIT_MANDATE_MODE unset/off nothing here is called, and today's behavior is
// bit-for-bit. The pure logic (flag, pre-check, selection, idempotency) lives in
// @/shared/mandate; this file is the thin I/O layer around it.
//
// Privacy: a SpendMandate is signed by the principal and observed by the agent ONLY —
// the auditor is NOT a stakeholder, so it never appears in these reads. We never log
// mandate values.
import { create, exercise, queryAs, ensureParty, pinnedParty, partyHint, ledgerReachable } from './client';
import {
  mandateEnabled, pickEligibleMandate, findExistingAuthorization,
  type MandateView, type AuthorizationView,
} from '@/shared/mandate';

const MANDATE_PKG = process.env.TACIT_MANDATE_PACKAGE_NAME || 'tacit-mandate';
/** Optional — only for evidence/health display; the package NAME is what template refs use. */
export const MANDATE_PKG_ID = process.env.TACIT_MANDATE_PACKAGE_ID || 'f3e2d2a95c64607323929d867b33a365c69c229298aad19e0ef6f537d1154d1a';

export const TM = {
  SpendMandate: `#${MANDATE_PKG}:Tacit.Mandate:SpendMandate`,
  SpendAuthorization: `#${MANDATE_PKG}:Tacit.Mandate:SpendAuthorization`,
};

/** The feature flag, read from the server env. Off/unset ⇒ today's behavior. */
export const mandateModeOn = (): boolean => mandateEnabled(process.env as Record<string, string | undefined>);

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

function toMandate(r: { contractId: string; payload: Record<string, any> }): MandateView {
  const p = r.payload || {};
  return {
    contractId: String(r.contractId),
    principal: String(p.principal || ''),
    agent: String(p.agent || ''),
    label: String(p.label || ''),
    currency: String(p.currency || 'USD.demo'),
    limit: num(p.limit),
    remaining: num(p.remaining),
    allowedServices: Array.isArray(p.allowedServices) ? p.allowedServices.map(String) : [],
    expiresAtUtc: p.expiresAtUtc != null ? String(p.expiresAtUtc) : null,
  };
}

function toAuthorization(r: { contractId: string; payload: Record<string, any> }): AuthorizationView {
  const p = r.payload || {};
  return {
    contractId: String(r.contractId),
    jobId: String(p.jobId || ''),
    amount: num(p.amount),
    serviceType: String(p.serviceType || ''),
    authorizedAtUtc: String(p.authorizedAtUtc || ''),
  };
}

/** Resolve the agent (buyer) party the same way work.ts does — prefer the pinned identity. */
export async function resolveAgentParty(buyerName?: string): Promise<string> {
  const hint = buyerName ? partyHint(buyerName) : 'Buyer';
  return pinnedParty(hint) || pinnedParty('Buyer') || (await ensureParty(hint));
}

/** Active SpendMandates visible to the agent (ledger enforces visibility). */
export async function queryAgentMandates(agent: string): Promise<MandateView[]> {
  const rows = await queryAs(agent, [TM.SpendMandate]);
  return rows.filter((r) => String(r.payload?.agent) === agent).map(toMandate);
}

/** Authorizations the agent co-signed (used for idempotency by jobId). */
export async function queryAgentAuthorizations(agent: string): Promise<AuthorizationView[]> {
  const rows = await queryAs(agent, [TM.SpendAuthorization]);
  return rows.filter((r) => String(r.payload?.agent) === agent).map(toAuthorization);
}

export interface SpendResult {
  authorizationCid: string;
  /** Remaining on the recreated mandate AFTER this spend (best-effort, re-queried). */
  remainingAfter: number | null;
}

/**
 * The single on-ledger spend authorization. Exercises `Authorize` against the agent's
 * mandate, which archives+recreates the mandate with `remaining - amount` and creates a
 * SpendAuthorization co-signed by principal + agent. Decimals are sent as strings (like a
 * SealedBid price). If the mandate is drained/expired/out-of-scope the choice FAILS on the
 * ledger and this THROWS — a real command failure, never a simulated one. We re-query for
 * the new authorization + remaining rather than parse the tuple result (adapter-robust).
 */
export async function authorizeSpend(
  agent: string,
  mandateCid: string,
  args: { amount: number; serviceType: string; jobId: string; rfsId: string },
): Promise<SpendResult> {
  await exercise(TM.SpendMandate, mandateCid, 'Authorize', {
    amount: String(args.amount),
    serviceType: args.serviceType,
    jobId: args.jobId,
    rfsId: args.rfsId,
  }, [agent]);
  const auths = await queryAgentAuthorizations(agent);
  const auth = findExistingAuthorization(auths, args.jobId);
  const mandates = await queryAgentMandates(agent);
  const recreated = pickEligibleMandate(mandates, args.serviceType, new Date().toISOString());
  return { authorizationCid: auth?.contractId || '', remainingAfter: recreated ? recreated.remaining : null };
}

export interface MandateStatus {
  enabled: boolean;
  ledgerReachable: boolean;
  agent: string | null;
  principal: string | null;
  /** The primary (most-remaining, in-scope-agnostic) active mandate, or null if none. */
  mandate: {
    contractId: string;
    label: string;
    currency: string;
    limit: number;
    remaining: number;
    allowedServices: string[]; // [] = unrestricted
    expiresAtUtc: string | null;
  } | null;
  /** All active mandates the agent can read (usually one in the demo). */
  count: number;
}

/**
 * Agent-side status read for /api/mandate/status + the MCP tool. Never throws for the
 * caller's benefit — returns `{enabled:false}` when the flag is off (route → honest 404),
 * `{ledgerReachable:false}` when the ledger is down.
 */
export async function getMandateStatus(buyerName?: string): Promise<MandateStatus> {
  if (!mandateModeOn()) {
    return { enabled: false, ledgerReachable: false, agent: null, principal: null, mandate: null, count: 0 };
  }
  if (!(await ledgerReachable())) {
    return { enabled: true, ledgerReachable: false, agent: null, principal: null, mandate: null, count: 0 };
  }
  const agent = await resolveAgentParty(buyerName);
  const mandates = await queryAgentMandates(agent);
  // Pick the "headline" mandate: the active one with the most remaining (unrestricted view).
  const nowIso = new Date().toISOString();
  const active = mandates.filter((m) => !m.expiresAtUtc || nowIso <= m.expiresAtUtc);
  const headline = active.slice().sort((a, b) => (b.remaining - a.remaining) || (a.contractId < b.contractId ? -1 : 1))[0] || null;
  return {
    enabled: true,
    ledgerReachable: true,
    agent,
    principal: headline ? headline.principal : (process.env.TACIT_PRINCIPAL_PARTY || null),
    mandate: headline
      ? {
          contractId: headline.contractId,
          label: headline.label,
          currency: headline.currency,
          limit: headline.limit,
          remaining: headline.remaining,
          allowedServices: headline.allowedServices,
          expiresAtUtc: headline.expiresAtUtc,
        }
      : null,
    count: active.length,
  };
}

// ── PRINCIPAL side — the real HUMAN user's controls over their agent's budget ──
// The principal is the person/business that grants + funds the agent. These are the
// user-facing on-ledger actions: fund (TopUp), stop (Revoke), (re)grant, and read
// the workspace. TopUp/Revoke/Grant are single lightweight submits (they succeed even
// while a full procurement burst is rate-limited).

/** The human principal party — the real user who grants + funds the agent's budget. */
export function resolvePrincipalParty(): string | null {
  return process.env.TACIT_PRINCIPAL_PARTY || pinnedParty('TacitPrincipal') || null;
}

/** Active SpendMandates the principal SIGNED (the budgets this user granted). */
export async function queryPrincipalMandates(principal: string): Promise<MandateView[]> {
  const rows = await queryAs(principal, [TM.SpendMandate]);
  return rows.filter((r) => String(r.payload?.principal) === principal).map(toMandate);
}

/** The user's spend history — every authorization the principal co-signed (a spend by its agent). */
export async function queryPrincipalAuthorizations(principal: string): Promise<AuthorizationView[]> {
  const rows = await queryAs(principal, [TM.SpendAuthorization]);
  return rows
    .filter((r) => String(r.payload?.principal) === principal)
    .map(toAuthorization)
    .sort((a, b) => (a.authorizedAtUtc < b.authorizedAtUtc ? 1 : -1)); // newest first
}

/** Pick the user's active headline mandate (most remaining), or null. */
function headlineMandate(mandates: MandateView[]): MandateView | null {
  const nowIso = new Date().toISOString();
  const active = mandates.filter((m) => !m.expiresAtUtc || nowIso <= m.expiresAtUtc);
  return active.slice().sort((a, b) => (b.remaining - a.remaining) || (a.contractId < b.contractId ? -1 : 1))[0] || null;
}

/** The PRINCIPAL adds budget to its mandate (real on-ledger TopUp). Resolves the mandate
 *  server-side. Returns the new state. Throws on a real ledger failure (caller maps to 4xx/503). */
export async function topUpMandate(principal: string, amount: number): Promise<{ mandateCid: string; remaining: number; limit: number; currency: string }> {
  const before = headlineMandate(await queryPrincipalMandates(principal));
  if (!before) throw new Error('no active mandate to top up');
  await exercise(TM.SpendMandate, before.contractId, 'TopUp', { topUpAmount: String(amount) }, [principal]);
  const after = headlineMandate(await queryPrincipalMandates(principal));
  return { mandateCid: after?.contractId || '', remaining: after?.remaining ?? 0, limit: after?.limit ?? 0, currency: after?.currency || before.currency };
}

/** The PRINCIPAL revokes its mandate (archives it → the agent loses spending authority). */
export async function revokeMandate(principal: string): Promise<void> {
  const m = headlineMandate(await queryPrincipalMandates(principal));
  if (!m) return; // already none
  await exercise(TM.SpendMandate, m.contractId, 'Revoke', {}, [principal]);
}

/** Grant a NEW mandate (create as principal) — onboarding, or re-granting after a revoke. */
export async function grantMandate(
  principal: string,
  agent: string,
  args: { label: string; currency: string; limit: number; allowedServices: string[] },
): Promise<string> {
  return create(TM.SpendMandate, {
    principal, agent, label: args.label, currency: args.currency,
    limit: String(args.limit.toFixed(2)), remaining: String(args.limit.toFixed(2)),
    allowedServices: args.allowedServices, expiresAtUtc: null,
  }, [principal]);
}

export interface WorkspaceView {
  enabled: boolean;
  ledgerReachable: boolean;
  packageId: string;
  principal: string | null; // the user's Canton identity
  agent: string | null;     // the agent that works for them
  mandate: {
    contractId: string; label: string; currency: string;
    limit: number; remaining: number; spent: number;
    allowedServices: string[]; expiresAtUtc: string | null;
  } | null;
  history: AuthorizationView[]; // the agent's spends the user authorized (newest first)
}

/** The human user's workspace: their Canton identity, the budget they granted their agent,
 *  and their on-ledger spend history. Reads only — never throws for the caller. */
export async function getWorkspace(): Promise<WorkspaceView> {
  const base = { enabled: mandateModeOn(), ledgerReachable: false, packageId: MANDATE_PKG_ID, principal: null, agent: null, mandate: null, history: [] as AuthorizationView[] };
  if (!mandateModeOn()) return base;
  if (!(await ledgerReachable())) return { ...base, enabled: true };
  const principal = resolvePrincipalParty();
  if (!principal) return { ...base, enabled: true, ledgerReachable: true };
  const mandates = await queryPrincipalMandates(principal);
  const m = headlineMandate(mandates);
  const history = await queryPrincipalAuthorizations(principal);
  const agent = m?.agent || (await resolveAgentParty());
  return {
    enabled: true,
    ledgerReachable: true,
    packageId: MANDATE_PKG_ID,
    principal,
    agent,
    mandate: m
      ? { contractId: m.contractId, label: m.label, currency: m.currency, limit: m.limit, remaining: m.remaining, spent: Math.max(0, m.limit - m.remaining), allowedServices: m.allowedServices, expiresAtUtc: m.expiresAtUtc }
      : null,
    history,
  };
}
