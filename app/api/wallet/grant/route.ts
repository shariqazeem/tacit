// Tacit — the human user GRANTS their agent a budget (onboarding, or re-granting after a
// revoke). A REAL on-ledger `SpendMandate` create as the principal. Flag-gated; throttle → 503.
// Refuses if an active mandate already exists (top up that one instead of duplicating).
import { NextResponse } from 'next/server';
import { grantMandate, resolvePrincipalParty, resolveAgentParty, queryPrincipalMandates, mandateModeOn } from '@/app/lens/ledger/mandate';
import { classifyLedgerError, LEDGER_WRITE_THROTTLED } from '@/shared/ledgerErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_GRANT = 100000;

export async function POST(req: Request) {
  if (!mandateModeOn()) return NextResponse.json({ ok: false, error: 'workspaces are not enabled' }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const limit = Number(body?.limit);
  if (!Number.isFinite(limit) || limit <= 0) return NextResponse.json({ ok: false, error: 'limit must be a positive number' }, { status: 400 });
  if (limit > MAX_GRANT) return NextResponse.json({ ok: false, error: `limit must be <= ${MAX_GRANT}` }, { status: 400 });
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : 'Standing procurement budget';

  const principal = resolvePrincipalParty();
  if (!principal) return NextResponse.json({ ok: false, error: 'no principal party configured' }, { status: 503 });

  try {
    const now = new Date().toISOString();
    const existing = (await queryPrincipalMandates(principal)).filter((m) => !m.expiresAtUtc || now <= m.expiresAtUtc);
    if (existing.length) return NextResponse.json({ ok: false, error: 'an active budget already exists — top it up instead of granting a new one' }, { status: 409 });
    const agent = await resolveAgentParty();
    const cid = await grantMandate(principal, agent, { label, currency: 'USD.demo', limit: Math.round(limit * 100) / 100, allowedServices: [] });
    return NextResponse.json({ ok: true, mandateCid: cid, limit: Math.round(limit * 100) / 100 });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (classifyLedgerError(msg) === 'throttled') {
      return NextResponse.json({ ok: false, reason: LEDGER_WRITE_THROTTLED, error: 'Canton devnet is rate-limiting writes right now — no budget was granted. Try again shortly.', retryable: true }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
