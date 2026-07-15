// Tacit Buyer Agent Console — turn a natural-language goal into a validated mandate.
//
// The LLM only PROPOSES. validateAgentPlan re-checks everything against the registry
// and the live capability quorum and fails closed — it validates EVERY proposal from
// EVERY model. On a rejection the planner runs one structured-repair retry (feeding
// the model its own output + the exact reason) and, only if a fallback model is
// configured, tries it too. A failure is always {ok:false, reason} — never fabricated.
import { NextResponse } from 'next/server';
import { agentLlmAvailable, callModelRaw, MODELS } from '@/app/lib/agentLlm';
import { planWithRepairAndFallback } from '@/shared/agentPlanner';
import { validateAgentPlan } from '@/shared/services';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_GOAL = 2000;

const SYSTEM = [
  "You are Tacit's procurement planner. Convert the user's goal into a mandate to hire a provider agent.",
  'Return ONLY one JSON object, no prose, no code fences, with EXACTLY these keys:',
  '{"serviceType":<see below>,"input":{"url":"https://HOST"},"policyId":<see below>,',
  '"maxBudget":<integer>,"confidence":<0..1>,"assumptions":[<short strings>]}',
  'Choose serviceType by intent:',
  '• "vendor_security_assessment" for security / onboarding / vetting / posture / TLS / headers / vendor risk.',
  '  Its policies: "standard-saas-v1" (default) or "strict-infrastructure-v1" (if strict/infrastructure/critical/data/regulated).',
  '• "web_performance_probe" for speed / latency / TTFB / "is it fast enough" / performance / responsiveness.',
  '  Its policies: "latency-slo-standard-v1" (default) or "latency-slo-strict-v1" (if strict/latency-sensitive/latency-critical).',
  'policyId MUST belong to the chosen service (never mix them). input.url MUST be an https:// URL for the host',
  'the user named (prepend https:// if missing); never invent a host the user did not name. Set maxBudget from',
  "the user's stated number (default 25). You do NOT approve, decide, price, or invent findings — only propose.",
  '',
  'Examples (goal → exact JSON):',
  `"We're onboarding acme-corp.com as a vendor — strict about infrastructure, budget 60." → {"serviceType":"vendor_security_assessment","input":{"url":"https://acme-corp.com"},"policyId":"strict-infrastructure-v1","maxBudget":60,"confidence":0.9,"assumptions":["strict about infrastructure → strict policy"]}`,
  `"Is example.com fast enough for launch? Standard SLO, budget 40." → {"serviceType":"web_performance_probe","input":{"url":"https://example.com"},"policyId":"latency-slo-standard-v1","maxBudget":40,"confidence":0.9,"assumptions":[]}`,
  `"Quick security pre-screen of example.com before we integrate, budget 50." → {"serviceType":"vendor_security_assessment","input":{"url":"https://example.com"},"policyId":"standard-saas-v1","maxBudget":50,"confidence":0.85,"assumptions":["standard SaaS pre-screen"]}`,
  `"We handle regulated data — do a hardened security review of vault.example.org, budget 90." → {"serviceType":"vendor_security_assessment","input":{"url":"https://vault.example.org"},"policyId":"strict-infrastructure-v1","maxBudget":90,"confidence":0.9,"assumptions":["regulated/hardened → strict-infrastructure"]}`,
  `"Our users are latency-sensitive — hold shop.example.net to a strict TTFB SLO, budget 70." → {"serviceType":"web_performance_probe","input":{"url":"https://shop.example.net"},"policyId":"latency-slo-strict-v1","maxBudget":70,"confidence":0.9,"assumptions":["latency-sensitive → strict latency SLO"]}`,
].join('\n');

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const goalText = typeof body?.goalText === 'string' ? body.goalText.slice(0, MAX_GOAL) : '';
  if (goalText.trim().length < 4) return NextResponse.json({ ok: false, reason: 'describe your goal in a sentence' }, { status: 400 });

  if (!agentLlmAvailable()) {
    return NextResponse.json({ ok: false, reason: 'the agent planner is not configured — use the Manual tab' }, { status: 503 });
  }

  // The hard gate — authoritative for every proposal from every model.
  const runners = await fetchRunners();
  const validate = (obj: unknown) => validateAgentPlan(obj, (sid) => quorumFor(runners, sid).quorum);

  const result = await planWithRepairAndFallback(goalText, SYSTEM, MODELS, callModelRaw, validate);
  if (result.ok !== true) {
    return NextResponse.json({ ok: false, reason: `the planner could not produce a usable proposal — ${result.reason}. Rephrase, or use Manual.` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, proposal: result.proposal });
}
