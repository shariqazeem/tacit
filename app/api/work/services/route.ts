// Tacit Work — public registered-service catalog. Returns ONLY safe metadata
// (id, name, description, version, input fields, legacy) plus runtime availability
// derived from the live per-service runner quorum. No prices, policies, or internals.
import { NextResponse } from 'next/server';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';
import { listPublicServices, DEFAULT_SERVICE } from '@/shared/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const runners = await fetchRunners();
  const services = listPublicServices().map((s) => {
    const q = quorumFor(runners, s.id);
    return { ...s, available: q.quorum, supportingRunners: q.supported, default: s.id === DEFAULT_SERVICE };
  });
  return NextResponse.json({ ok: true, defaultService: DEFAULT_SERVICE, services });
}
