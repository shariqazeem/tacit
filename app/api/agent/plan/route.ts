// Tacit Buyer Agent Console — turn a natural-language goal into a validated mandate.
//
// The LLM only PROPOSES. validateAgentPlan re-checks everything against the registry
// and the live capability quorum and fails closed. Nothing is spent here — the human
// approves the mandate separately, which then calls the real /api/work/procure.
import { NextResponse } from 'next/server';
import { agentLlmAvailable, agentLlmJson } from '@/app/lib/agentLlm';
import { validateAgentPlan } from '@/shared/services';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_GOAL = 2000;

const SYSTEM = [
  "You are Tacit's procurement planner. Convert the user's onboarding goal into a mandate to hire an",
  "agent that assesses a vendor's PUBLIC web-security posture. Return ONLY one JSON object, no prose,",
  'with EXACTLY these keys:',
  '{"serviceType":"vendor_security_assessment","input":{"url":"https://HOST"},',
  '"policyId":"standard-saas-v1" or "strict-infrastructure-v1","maxBudget":<integer>,',
  '"confidence":<0..1>,"assumptions":[<short strings>]}',
  'Rules: serviceType is ALWAYS "vendor_security_assessment". input.url MUST be an https:// URL for the',
  'vendor host the user named (prepend https:// if missing); never invent a host the user did not name.',
  'Pick "strict-infrastructure-v1" if the user says strict / infrastructure / critical / data / regulated,',
  'otherwise "standard-saas-v1". Set maxBudget from the user\'s stated budget (default 25). You do NOT',
  'approve, decide, price, or invent findings — you only propose. Downstream validation is authoritative.',
].join(' ');

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const goalText = typeof body?.goalText === 'string' ? body.goalText.slice(0, MAX_GOAL) : '';
  if (goalText.trim().length < 4) return NextResponse.json({ ok: false, reason: 'describe your goal in a sentence' }, { status: 400 });

  // No fabrication: if the planner is not configured or fails, say so honestly.
  if (!agentLlmAvailable()) {
    return NextResponse.json({ ok: false, reason: 'the agent planner is not configured — use the Manual tab' }, { status: 503 });
  }
  const raw = await agentLlmJson(SYSTEM, `Goal: ${goalText}`);
  if (raw == null) {
    return NextResponse.json({ ok: false, reason: 'the planner could not produce a usable proposal — rephrase, or use Manual' }, { status: 502 });
  }

  // HARD gate: re-validate everything against the registry + live capability quorum.
  const runners = await fetchRunners();
  const v = validateAgentPlan(raw, (sid) => quorumFor(runners, sid).quorum);
  if (v.ok !== true) return NextResponse.json({ ok: false, reason: v.reason }, { status: 200 });

  // A proposal only — nothing has been spent.
  return NextResponse.json({ ok: true, proposal: v.proposal });
}
