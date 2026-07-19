// Tacit — real CANTON COIN status (Splice Amulet, devnet). The live on-ledger balance of
// this validator's onboarded wallet. Honest 404 when no wallet API is configured.
import { NextResponse } from 'next/server';
import { getCoinStatus, coinEnabled } from '@/app/lens/ledger/coin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!coinEnabled()) return NextResponse.json({ ok: false, error: 'Canton Coin wallet is not configured on this deployment' }, { status: 404 });
  try {
    const s = await getCoinStatus();
    if (!s.ledgerReachable) return NextResponse.json({ ok: false, error: 'wallet API unreachable' }, { status: 503 });
    return NextResponse.json({ ok: true, ...s });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
