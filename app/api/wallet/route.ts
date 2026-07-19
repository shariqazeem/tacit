// Tacit — the human user's WORKSPACE (principal-side). Their Canton identity, the budget
// they granted their agent, and their on-ledger spend history. FLAG-GATED: honest 404 when
// TACIT_MANDATE_MODE is off. Reads only.
import { NextResponse } from 'next/server';
import { getWorkspace, mandateModeOn } from '@/app/lens/ledger/mandate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!mandateModeOn()) {
    return NextResponse.json({ ok: false, error: 'workspaces are not enabled on this deployment' }, { status: 404 });
  }
  try {
    const ws = await getWorkspace();
    if (!ws.ledgerReachable) return NextResponse.json({ ok: false, error: 'ledger unreachable' }, { status: 503 });
    return NextResponse.json({ ok: true, ...ws });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
