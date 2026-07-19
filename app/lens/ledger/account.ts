// Tacit — CUSTODIAL per-user accounts. Each visitor gets their OWN Canton party (identity)
// and their OWN on-ledger budget (a SpendMandate granted to the shared buyer agent). Keys are
// validator-custodied — the honest Canton model on a hosted validator (neobank-style custody,
// not browser self-custody, which Canton does not have). Account creation + funding are single
// lightweight submits, so they work even while a full-procurement burst is rate-limited.
//
// The session is a SIGNED cookie holding the user's party id (HMAC so it can't be forged to
// another user's party). Absent/invalid cookie ⇒ fall back to the global principal, so the
// pre-account behavior is preserved.
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { ensureParty } from './client';
import { grantMandate, resolveAgentParty, resolvePrincipalParty } from './mandate';

export const ACCOUNT_COOKIE = 'tacit_acct';

const KEY = crypto.createHash('sha256').update(process.env.TACIT_SESSION_SECRET || process.env.TACIT_DEVNET_CLIENT_SECRET || 'tacit-demo-session').digest();
const sign = (party: string) => crypto.createHmac('sha256', KEY).update(party).digest('hex').slice(0, 24);

/** Pack a party into a tamper-evident cookie value. */
export function packCookie(party: string): string {
  return `${party}|${sign(party)}`;
}
/** Verify + unpack a cookie value into a party id, or null if forged/absent. */
export function unpackCookie(val: string | undefined | null): string | null {
  if (!val) return null;
  const i = val.lastIndexOf('|');
  if (i < 0) return null;
  const party = val.slice(0, i);
  const sig = val.slice(i + 1);
  return sig === sign(party) && party.includes('::') ? party : null;
}

/** The current session's principal party (their account), or null if none. */
export async function sessionPrincipal(): Promise<string | null> {
  try {
    const jar = await cookies();
    return unpackCookie(jar.get(ACCOUNT_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** The principal to act as: the session account if signed-in, else the global demo principal. */
export async function effectivePrincipal(): Promise<string | null> {
  return (await sessionPrincipal()) || resolvePrincipalParty();
}

function newHint(): string {
  return 'TacitUser' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

export interface AccountResult {
  party: string;
  mandateCid: string;
  limit: number;
}

/**
 * Create a new custodial account: allocate the user's own Canton party (which also grants the
 * ledger user CanActAs it) and grant it an initial on-ledger budget. Two single submits.
 */
export async function createAccount(initialBudget = 500): Promise<AccountResult> {
  const party = await ensureParty(newHint());
  const agent = await resolveAgentParty();
  const mandateCid = await grantMandate(party, agent, {
    label: 'Your standing budget', currency: 'USD.demo', limit: initialBudget, allowedServices: [],
  });
  return { party, mandateCid, limit: initialBudget };
}
