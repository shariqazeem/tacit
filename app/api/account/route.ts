// Tacit — the current session's account (their Canton party), or null if not signed in.
import { NextResponse } from 'next/server';
import { sessionPrincipal } from '@/app/lens/ledger/account';
import { mandateModeOn } from '@/app/lens/ledger/mandate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!mandateModeOn()) return NextResponse.json({ ok: false, error: 'accounts are not enabled' }, { status: 404 });
  const party = await sessionPrincipal();
  return NextResponse.json({ ok: true, signedIn: !!party, party: party || null });
}
