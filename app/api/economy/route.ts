import { NextResponse } from 'next/server';
import { getEconomy, getPartyEconomy } from '@/app/lens/ledger/economy';

// The live ledger economy (read-only). GET /api/economy → provider wealth +
// recent settlements (buyer's view). GET /api/economy?party=<name> → that
// party's own private view (settlements + earnings it is a stakeholder of).
// Everything is derived from live Canton queries; if Canton is unreachable the
// response is { available:false } and the UI hides the section.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PARTY_RE = /^[A-Za-z0-9 _-]{3,24}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const partyRaw = searchParams.get('party');
  if (partyRaw != null) {
    const party = partyRaw.trim();
    if (!PARTY_RE.test(party)) {
      return NextResponse.json({ available: false, error: 'invalid party name (3–24 chars, letters/digits/space/_/-)' }, { status: 400 });
    }
    return NextResponse.json(await getPartyEconomy(party));
  }
  return NextResponse.json(await getEconomy());
}
