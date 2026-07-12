// Tacit Work — buyer procurement endpoint. Devnet/real-runner only. Never falls
// back to the internal negotiation engine and never returns a fake success.
// Only an allowlisted, registered service with a 3-runner capability quorum runs.
import { NextResponse } from 'next/server';
import { procureWork } from '@/app/lens/ledger/work';
import { WORK_SCHEMA, type WorkError } from '@/app/lens/ledger/workTypes';
import { getService, DEFAULT_SERVICE, POLICY_IDS, type PolicyId } from '@/shared/services';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;
const MAX_BODY_BYTES = 4096;

const fail = (error: string, status: number) =>
  NextResponse.json<WorkError>({ ok: false, error, schema: WORK_SCHEMA }, { status });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail('request body too large', 413);
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail('invalid JSON body', 400);
  }

  const jobId = typeof body?.jobId === 'string' && JOB_RE.test(body.jobId) ? body.jobId : null;
  const serviceType = typeof body?.serviceType === 'string' && body.serviceType ? body.serviceType : DEFAULT_SERVICE;
  const input = body?.input && typeof body.input === 'object' ? body.input : {};
  const rawBudget = body?.maxBudget;
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.slice(0, 64) : undefined;
  const requestSource = body?.requestSource === 'mcp' ? 'mcp' : 'browser';
  const policyId: PolicyId | undefined = POLICY_IDS.includes(body?.policyId) ? body.policyId : undefined;

  if (!jobId) return fail('jobId required ([A-Za-z0-9._:-]{3,64})', 400);

  // Registry: only a registered service, with a valid input, may be procured.
  const svc = getService(serviceType);
  if (!svc) return fail(`unregistered serviceType (registered: vendor_security_assessment, site_audit)`, 400);
  const inputVal = svc.validateInput(input);
  if (inputVal.ok !== true) return fail(inputVal.error, 400);

  if (!Number.isFinite(rawBudget) || rawBudget <= 0) return fail('maxBudget must be a positive number', 400);
  if (rawBudget > 10000) return fail('maxBudget must be <= 10000', 400);
  const maxBudget = Math.round(rawBudget);

  // Capability quorum: refuse (no fallback) unless 3 distinct runners advertise it.
  const q = quorumFor(await fetchRunners(), serviceType);
  if (!q.quorum) return fail(`${serviceType} is supported by ${q.supported}/3 provider runners — not ready`, 503);

  try {
    const result = await procureWork({ jobId, serviceType, input: inputVal.value, maxBudget, buyerName, requestSource, policyId });
    return NextResponse.json(result);
  } catch (e: any) {
    return fail(String(e?.message || e), 502);
  }
}
