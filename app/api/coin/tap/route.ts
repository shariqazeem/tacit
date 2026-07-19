// Tacit — TAP real Canton Coin from the devnet faucet (Splice mint). A genuine on-ledger
// Amulet mint. Bounded amount. Honest 404 when no wallet API is configured.
import { NextResponse } from 'next/server';
import { tapCoin, getCoinStatus, coinEnabled } from '@/app/lens/ledger/coin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TAP = 1000;

export async function POST(req: Request) {
  if (!coinEnabled()) return NextResponse.json({ ok: false, error: 'Canton Coin wallet is not configured' }, { status: 404 });
  let body: any = {};
  try { body = await req.json(); } catch { /* default amount */ }
  let amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) amount = 10;
  if (amount > MAX_TAP) return NextResponse.json({ ok: false, error: `amount must be <= ${MAX_TAP}` }, { status: 400 });
  amount = Math.round(amount * 100) / 100;
  try {
    const { contractId } = await tapCoin(amount);
    const after = await getCoinStatus().catch(() => null);
    return NextResponse.json({ ok: true, tapped: amount, contractId, unlocked: after?.unlocked ?? null, round: after?.round ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
