// Tacit — create a CUSTODIAL account: allocate the user's own Canton party + an initial
// on-ledger budget, and set the signed session cookie. Single lightweight submits (works
// under the write-burst cap). Flag-gated; throttle → honest 503.
import { NextResponse } from 'next/server';
import { createAccount, packCookie, ACCOUNT_COOKIE, sessionPrincipal } from '@/app/lens/ledger/account';
import { mandateModeOn } from '@/app/lens/ledger/mandate';
import { classifyLedgerError, LEDGER_WRITE_THROTTLED } from '@/shared/ledgerErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BUDGET = 100000;

export async function POST(req: Request) {
  if (!mandateModeOn()) return NextResponse.json({ ok: false, error: 'accounts are not enabled' }, { status: 404 });

  // Already signed in → don't allocate a duplicate party.
  const existing = await sessionPrincipal();
  if (existing) return NextResponse.json({ ok: true, party: existing, existing: true });

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  let budget = Number(body?.initialBudget);
  if (!Number.isFinite(budget) || budget <= 0) budget = 500;
  if (budget > MAX_BUDGET) budget = MAX_BUDGET;
  budget = Math.round(budget);

  try {
    const acct = await createAccount(budget);
    const res = NextResponse.json({ ok: true, party: acct.party, mandateCid: acct.mandateCid, limit: acct.limit });
    res.cookies.set(ACCOUNT_COOKIE, packCookie(acct.party), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (classifyLedgerError(msg) === 'throttled') {
      return NextResponse.json({ ok: false, reason: LEDGER_WRITE_THROTTLED, error: 'Canton devnet is rate-limiting writes right now — your account was not created. Try again shortly.', retryable: true }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
