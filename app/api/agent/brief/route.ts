// Tacit Buyer Agent Console — plain-English brief of an ALREADY-VERIFIED result.
//
// The LLM is grounded on ONLY a compact projection of the verified WorkResult and
// instructed to cite nothing that is not present. It decides nothing (evaluatePolicy
// already did). On ANY failure this returns { ok:false } and the UI renders nothing
// extra — the verified result stands alone.
import { NextResponse } from 'next/server';
import { agentLlmAvailable, agentLlmText } from '@/app/lib/agentLlm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM = [
  "You are Tacit's buyer agent explaining a COMPLETED, already-verified vendor assessment to a human.",
  'You are given ONLY a JSON object. Write plain English, at most 120 words. Cover: the onboarding',
  'decision and why, the top 2-3 findings, and the recommended next step. Cite ONLY facts present in the',
  'JSON. Do NOT introduce any number, score, finding, price, contract id, or claim that is not in the',
  'JSON. No markdown headers, no preamble, no lists — just a short paragraph.',
].join(' ');

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const wr = body?.workResult;
  if (!wr || typeof wr !== 'object' || wr.ok !== true) return NextResponse.json({ ok: false }, { status: 400 });
  if (!agentLlmAvailable()) return NextResponse.json({ ok: false }, { status: 200 });

  // Ground the model on ONLY a safe projection of the verified result — never the
  // private report bytes, provider prices/policy, or ledger internals.
  const rep = wr.artifact?.report || {};
  const grounded = {
    decision: wr.policy?.decision ?? null,
    policy: wr.policy?.policyId ?? null,
    reasonCodes: wr.policy?.reasonCodes ?? [],
    statement: wr.policy?.statement ?? null,
    target: wr.input?.url ?? null,
    score: rep.score ?? null,
    riskBand: rep.riskBand ?? null,
    findings: Array.isArray(rep.findings) ? rep.findings.slice(0, 6).map((f: any) => ({ severity: f.severity, title: f.title, remediation: f.remediation })) : [],
    requiredActions: wr.policy?.requiredActions ?? [],
    verified: wr.buyerVerification?.verified ?? null,
  };
  if (grounded.decision == null || grounded.score == null) return NextResponse.json({ ok: false }, { status: 200 });

  const brief = await agentLlmText(SYSTEM, JSON.stringify(grounded));
  if (!brief) return NextResponse.json({ ok: false }, { status: 200 });
  return NextResponse.json({ ok: true, brief: brief.slice(0, 1200) });
}
