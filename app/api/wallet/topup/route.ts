// Tacit — the human user FUNDS their agent's budget. A REAL on-ledger `TopUp` exercised as
// the principal party (raises remaining + limit). A single lightweight submit — succeeds even
// when a full procurement burst is rate-limited. Flag-gated; throttle → honest 503.
import { NextResponse } from 'next/server';
import { topUpMandate, resolvePrincipalParty, mandateModeOn } from '@/app/lens/ledger/mandate';
import { classifyLedgerError, LEDGER_WRITE_THROTTLED } from '@/shared/ledgerErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 2048;
const MAX_TOPUP = 100000;

export async function POST(req: Request) {
  if (!mandateModeOn()) return NextResponse.json({ ok: false, error: 'workspaces are not enabled' }, { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, error: 'request too large' }, { status: 413 });
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: 'amount must be a positive number' }, { status: 400 });
  if (amount > MAX_TOPUP) return NextResponse.json({ ok: false, error: `amount must be <= ${MAX_TOPUP}` }, { status: 400 });
  const topUp = Math.round(amount * 100) / 100; // 2dp

  const principal = resolvePrincipalParty();
  if (!principal) return NextResponse.json({ ok: false, error: 'no principal party configured' }, { status: 503 });

  try {
    const result = await topUpMandate(principal, topUp);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (classifyLedgerError(msg) === 'throttled') {
      return NextResponse.json(
        { ok: false, reason: LEDGER_WRITE_THROTTLED, error: 'Canton devnet is rate-limiting writes right now — your funding was not applied and nothing was spent. Try again shortly.', retryable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
