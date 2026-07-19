// Tacit Mandate — agent-side status read. FLAG-GATED: with TACIT_MANDATE_MODE off/unset
// this endpoint does not exist as far as clients are concerned (honest 404). When on, it
// returns the agent's standing-mandate summary (remaining / limit / scope / expiry) read
// from the ledger. Privacy: the auditor is NOT a stakeholder of a mandate, so this only
// ever reflects what the agent itself may lawfully read. No mandate values are logged.
import { NextResponse } from 'next/server';
import { getMandateStatus, mandateModeOn } from '@/app/lens/ledger/mandate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!mandateModeOn()) {
    return NextResponse.json({ ok: false, error: 'spending-mandate mode is off' }, { status: 404 });
  }
  const buyerName = new URL(req.url).searchParams.get('buyerName') || undefined;
  try {
    const status = await getMandateStatus(buyerName);
    if (!status.ledgerReachable) {
      return NextResponse.json({ ok: false, error: 'ledger unreachable' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
