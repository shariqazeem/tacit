// Tacit Work — buyer procurement endpoint. Devnet/real-runner only. Never falls
// back to the internal negotiation engine and never returns a fake success.
import { NextResponse } from 'next/server';
import { procureWork } from '@/app/lens/ledger/work';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const jobId = typeof body?.jobId === 'string' && JOB_RE.test(body.jobId) ? body.jobId : null;
  const serviceType = typeof body?.serviceType === 'string' ? body.serviceType : 'site_audit';
  const url = typeof body?.input?.url === 'string' ? body.input.url : '';
  const maxBudget = Number.isFinite(body?.maxBudget) ? Math.min(Math.round(body.maxBudget), 10000) : 100;
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName : undefined;

  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId required ([A-Za-z0-9._:-]{3,64})' }, { status: 400 });
  if (serviceType !== 'site_audit') return NextResponse.json({ ok: false, error: 'unsupported serviceType (only site_audit)' }, { status: 400 });
  if (!/^https:\/\//i.test(url)) return NextResponse.json({ ok: false, error: 'input.url must be an https:// URL' }, { status: 400 });

  try {
    const result = await procureWork({ jobId, serviceType, input: { url }, maxBudget, buyerName });
    return NextResponse.json(result);
  } catch (e: any) {
    // No fake success: a failure is a clear non-200 with no ledger claim.
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
