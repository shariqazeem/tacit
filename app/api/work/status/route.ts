// Tacit Work — read-only, ledger-derived progress for a jobId. Each stage is true
// only when its real contract exists on-ledger (no timers, no fabrication). Safe to
// poll while /api/work/procure runs; unaffected by the sequencer's write path.
import { NextResponse } from 'next/server';
import { workStatus } from '@/app/lens/ledger/work';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get('jobId') || '';
  if (!JOB_RE.test(jobId)) return NextResponse.json({ ok: false, error: 'invalid jobId' }, { status: 400 });
  try {
    const status = await workStatus(jobId);
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
