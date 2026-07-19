// Tacit Work — buyer procurement endpoint. Devnet/real-runner only. Never falls
// back to the internal negotiation engine and never returns a fake success.
// Only an allowlisted, registered service with a 3-runner capability quorum runs.
import { NextResponse } from 'next/server';
import { procureWork } from '@/app/lens/ledger/work';
import { WORK_SCHEMA, type WorkError } from '@/app/lens/ledger/workTypes';
import { getService, DEFAULT_SERVICE, policiesForService, type PolicyId } from '@/shared/services';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';
import { effectivePrincipal } from '@/app/lens/ledger/account';
import { classifyLedgerError, LEDGER_WRITE_THROTTLED } from '@/shared/ledgerErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;
const MAX_BODY_BYTES = 4096;

const fail = (error: string, status: number) =>
  NextResponse.json<WorkError>({ ok: false, error, schema: WORK_SCHEMA }, { status });
const failWith = (reason: string, error: string, status: number, retryable = false) =>
  NextResponse.json<WorkError>({ ok: false, reason, error, retryable, schema: WORK_SCHEMA }, { status });

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
  const requestSource = ['mcp', 'console'].includes(body?.requestSource) ? body.requestSource : 'browser';
  // policyId is optional; if provided it must belong to the requested service.
  const policyId: PolicyId | undefined = typeof body?.policyId === 'string' && policiesForService(serviceType).includes(body.policyId) ? (body.policyId as PolicyId) : undefined;
  if (typeof body?.policyId === 'string' && !policyId) return fail(`policy "${body.policyId}" is not valid for ${serviceType}`, 400);

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

  // The signed-in account's budget gates this job (else the global demo principal's).
  const principalParty = (await effectivePrincipal()) || undefined;

  try {
    const result = await procureWork({ jobId, serviceType, input: inputVal.value, maxBudget, buyerName, requestSource, policyId, principalParty });
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // An exhausted/expired/out-of-scope spending mandate is an honest 402 (Payment
    // Required) with ZERO ledger writes — not a 502. The message is the human reason.
    if (e?.code === 'MANDATE_INSUFFICIENT') return failWith('MANDATE_INSUFFICIENT', msg, 402);
    // The shared devnet validator rate-limits WRITES from a credential after heavy bursts
    // (HTTP 403 "security-sensitive" / PERMISSION_DENIED). That is NOT a broken app: reads
    // stay live and this procurement never started, so nothing was spent. Surface it as a
    // distinct, retryable 503 the UI/MCP render as a calm "devnet is rate-limiting" state.
    if (classifyLedgerError(msg) === 'throttled') {
      return failWith(
        LEDGER_WRITE_THROTTLED,
        'Canton devnet is rate-limiting writes from this validator right now — the job was not started and nothing was spent. The market and privacy lens (reads) stay live; retrying the same job is safe.',
        503,
        true,
      );
    }
    return fail(msg, 502);
  }
}
