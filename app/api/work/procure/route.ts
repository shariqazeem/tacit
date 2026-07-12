// Tacit Work — buyer procurement endpoint. Devnet/real-runner only. Never falls
// back to the internal negotiation engine and never returns a fake success.
import { NextResponse } from 'next/server';
import { procureWork } from '@/app/lens/ledger/work';
import { WORK_SCHEMA, type WorkError } from '@/app/lens/ledger/workTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;
const MAX_BODY_BYTES = 4096;

const fail = (error: string, status: number) =>
  NextResponse.json<WorkError>({ ok: false, error, schema: WORK_SCHEMA }, { status });

export async function POST(req: Request) {
  // Bounded body — reject oversized payloads before parsing.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail('request body too large', 413);
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail('invalid JSON body', 400);
  }

  const jobId = typeof body?.jobId === 'string' && JOB_RE.test(body.jobId) ? body.jobId : null;
  const serviceType = typeof body?.serviceType === 'string' ? body.serviceType : 'site_audit';
  const url = typeof body?.input?.url === 'string' ? body.input.url : '';
  const rawBudget = body?.maxBudget;
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.slice(0, 64) : undefined;

  if (!jobId) return fail('jobId required ([A-Za-z0-9._:-]{3,64})', 400);
  if (serviceType !== 'site_audit') return fail('unsupported serviceType (only site_audit)', 400);
  if (typeof url !== 'string' || !/^https:\/\//i.test(url) || url.length > 2048) return fail('input.url must be an https:// URL', 400);
  if (!Number.isFinite(rawBudget) || rawBudget <= 0) return fail('maxBudget must be a positive number', 400);
  if (rawBudget > 10000) return fail('maxBudget must be <= 10000', 400);
  const maxBudget = Math.round(rawBudget);

  try {
    const result = await procureWork({ jobId, serviceType, input: { url }, maxBudget, buyerName });
    return NextResponse.json(result);
  } catch (e: any) {
    // No fake success: a failure is a clear non-200 with no ledger claim.
    return fail(String(e?.message || e), 502);
  }
}
