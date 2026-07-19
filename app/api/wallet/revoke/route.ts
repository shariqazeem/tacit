// Tacit — the human user REVOKES their agent's spending authority. A REAL on-ledger `Revoke`
// exercised as the principal (archives the mandate). Flag-gated; throttle → honest 503.
import { NextResponse } from 'next/server';
import { revokeMandate, resolvePrincipalParty, mandateModeOn } from '@/app/lens/ledger/mandate';
import { classifyLedgerError, LEDGER_WRITE_THROTTLED } from '@/shared/ledgerErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  if (!mandateModeOn()) return NextResponse.json({ ok: false, error: 'workspaces are not enabled' }, { status: 404 });
  const principal = resolvePrincipalParty();
  if (!principal) return NextResponse.json({ ok: false, error: 'no principal party configured' }, { status: 503 });
  try {
    await revokeMandate(principal);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (classifyLedgerError(msg) === 'throttled') {
      return NextResponse.json(
        { ok: false, reason: LEDGER_WRITE_THROTTLED, error: 'Canton devnet is rate-limiting writes right now — the mandate was not changed. Try again shortly.', retryable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
