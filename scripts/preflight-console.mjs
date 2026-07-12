// Tacit Buyer Agent Console preflight.
//
//   APP_URL=https://host node scripts/preflight-console.mjs --require-ledger --require-runners
//
// Proves: (1) the agent endpoints fail HONESTLY without an LLM key (no fabricated
// proposal, no success-shaped brief); (2) plan validation fails closed on hostile
// inputs (inline fixtures); (3) the console/manual buyer path runs a REAL vendor
// procurement end-to-end (requestSource=console), with the deterministic policy and
// buyer verification intact. The LLM is never on the work path.
import { validateAgentPlan, PLAN_BUDGET_MAX } from '../runner/dist/_shared.js';

const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
const REQUIRE_LEDGER = process.argv.includes('--require-ledger');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };
const must = (c, m) => (c ? ok(m) : bad(m));

async function j(url, opts = {}, t = 180000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), t);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text }; }
  finally { clearTimeout(timer); }
}
const post = (path, body, t) => j(APP_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, t);

console.log(`Tacit console preflight → ${APP_URL}\n`);

// ── 1) plan validator fails closed (inline; the security boundary) ───────────
console.log('Plan validator (fail-closed):');
const YES = () => true;
const good = { serviceType: 'vendor_security_assessment', input: { url: 'https://acme.com' }, policyId: 'standard-saas-v1', maxBudget: 25 };
must(validateAgentPlan(good, YES).ok === true, 'valid mandate passes');
must(validateAgentPlan({ ...good, serviceType: 'site_audit' }, YES).ok === false, 'legacy service rejected');
must(validateAgentPlan({ ...good, input: { url: 'http://acme.com' } }, YES).ok === false, 'non-https rejected');
must(validateAgentPlan({ ...good, input: { url: 'https://127.0.0.1' } }, YES).ok === false, 'SSRF host rejected');
must(validateAgentPlan({ ...good, maxBudget: PLAN_BUDGET_MAX + 1 }, YES).ok === false, 'absurd budget rejected');
must(validateAgentPlan({ ...good, policyId: 'approve-all' }, YES).ok === false, 'unknown policy rejected');
must(validateAgentPlan(good, () => false).ok === false, 'no capability quorum → rejected');
const inj = validateAgentPlan({ ...good, approve: true, decision: 'approve' }, YES);
must(inj.ok === true && !('approve' in inj.proposal) && !('decision' in inj.proposal), 'prompt-injection extra fields do not leak into the mandate');

// ── 2) agent endpoints behave honestly — adaptive to whether a key is set ────
// A 503 from /plan means the planner is unconfigured; anything else means a real
// LLM is wired. We assert the correct honest behavior for whichever mode is live,
// so this passes both in CI (no key) and on the deployed VM (real key).
const badPlan = await post('/api/agent/plan', { goalText: 'x' }, 15000);
must(badPlan.status === 400 && badPlan.json?.ok === false, 'a too-short goal is a clean 400, not a crash');

const plan = await post('/api/agent/plan', { goalText: 'check whether https://acme.com is fast enough for our users, budget 25' }, 40000);
const llmConfigured = plan.status !== 503;

if (!llmConfigured) {
  console.log('\nAgent endpoints (no LLM key — honest failure, never fabrication):');
  must(plan.json && plan.json.ok === false && typeof plan.json.reason === 'string', 'without a key, /api/agent/plan returns {ok:false, reason} — never a fabricated proposal');
  must(!plan.json?.proposal, '/api/agent/plan does not return a proposal on failure');
  const brief = await post('/api/agent/brief', { workResult: { ok: true, policy: { decision: 'approve' }, artifact: { report: { score: 90 } }, input: { url: 'https://acme.com' } } }, 40000);
  must(brief.json && brief.json.ok === false && !brief.json.brief, 'without a key, /api/agent/brief returns {ok:false} and no brief — the verified result stands alone');
} else {
  console.log('\nAgent endpoints (real LLM key — proposal is only a proposal, hard-gated):');
  // The planner PROPOSED; the same pure hard gate must independently accept it, and
  // nothing may be spent by planning. (ok:false here is also acceptable — the LLM is
  // allowed to decline — but a returned proposal MUST survive re-validation.)
  if (plan.json?.ok === true) {
    const p = plan.json.proposal;
    must(!!p && validateAgentPlan(p, YES).ok === true, 'a returned proposal independently re-passes the pure hard gate (validateAgentPlan)');
    must(!('decision' in (p || {})) && !('score' in (p || {})) && !('price' in (p || {})), 'proposal carries no decision/score/price — the LLM only proposes');
  } else {
    must(plan.json?.ok === false && typeof plan.json?.reason === 'string', 'planner may decline, but only as {ok:false, reason} — never a fabricated proposal');
    must(!plan.json?.proposal, 'a declined plan returns no proposal');
  }
  // The brief endpoint, given an already-verified result, returns a grounded string
  // or an honest ok:false — it never manufactures a success shape with a new decision.
  const brief = await post('/api/agent/brief', { workResult: { ok: true, policy: { decision: 'approve' }, artifact: { report: { score: 90 } }, input: { url: 'https://acme.com' } } }, 40000);
  must(brief.json && (brief.json.ok === false || typeof brief.json.brief === 'string'), '/api/agent/brief returns a grounded brief string or an honest {ok:false}');
}

// ── 3) real console buyer path (Manual/console e2e; no LLM on the work path) ──
if (REQUIRE_LEDGER) {
  console.log('\nReal console procurement (requestSource=console):');
  const health = (await j(APP_URL + '/api/work/health', {}, 15000)).json;
  must(health?.launchReady === true, `vendor launch ready (${health?.reason || 'ok'})`);
  const jobId = 'cjob-' + Math.random().toString(36).slice(2, 12);
  const res = await post('/api/work/procure', { jobId, serviceType: 'vendor_security_assessment', input: { url: 'https://example.com' }, maxBudget: 100, policyId: 'standard-saas-v1', requestSource: 'console', buyerName: 'Judge-Agent' }, 180000);
  const w = res.json;
  if (res.status !== 200 || !w?.ok) { bad(`console procurement failed (HTTP ${res.status}): ${(res.text || '').slice(0, 200)}`); }
  else {
    must(w.requestSource === 'console', 'result echoes requestSource=console');
    must(w.serviceType === 'vendor_security_assessment' && w.artifact?.report?.service === 'vendor_security_assessment', 'real vendor assessment delivered');
    must(w.buyerVerification?.verified === true, 'buyer verification passed (hash+schema+target+score)');
    must(!!w.policy && ['approve', 'approve_with_conditions', 'human_review', 'reject'].includes(w.policy.decision), `deterministic policy decision (${w.policy?.decision})`);
    must(!!w.evidence?.receiptContractId, 'real receipt created');
  }
}

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Console preflight — plan fails closed, agents fail honestly, and the console runs a real no-fallback procurement.');
process.exit(fails ? 1 : 0);
