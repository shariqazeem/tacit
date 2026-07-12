// GET /api/market/overview — the agent economy from the AUDITOR's chair.
//
// Every number is computed live from Canton contracts the pinned Auditor party can
// lawfully see (Settlements + DeliveryReceipts), plus safe runner-health capability
// fields. A ≤15s server-side read cache means rapid polls share one asOfUtc; the
// body NEVER contains sealed bids, report bodies, or target urls. On any failure the
// response is an honest { available:false, reason } — never a fabricated market.
import { NextResponse } from 'next/server';
import { getMarketOverview } from '@/app/lens/ledger/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const res = await getMarketOverview();
  if (res.available !== true) {
    return NextResponse.json(res, { status: 503 });
  }
  return NextResponse.json(res);
}
