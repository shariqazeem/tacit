// Tacit — planner reliability smoke. POSTs 6 goals (the 3 landing chips verbatim +
// 3 fresh paraphrases the model has NOT seen as few-shot) to /api/agent/plan and
// asserts each returns a HARD-GATE-VALID proposal with the expected serviceType and
// policy family. Reads only — never touches the ledger. Run 3× for a flake table.
//
//   APP_URL=https://host node scripts/planner-smoke.mjs

const APP_URL = (process.env.APP_URL || 'https://tacit.80-225-209-190.sslip.io').replace(/\/$/, '');

// expected: [serviceType, strict?] — policy family, not the exact id.
const CASES = [
  { src: 'chip', goal: "We're onboarding acme-corp.com as a vendor — strict about infrastructure, budget 60.", svc: 'vendor_security_assessment', strict: true },
  { src: 'chip', goal: 'Is example.com fast enough for launch? Standard SLO, budget 40.', svc: 'web_performance_probe', strict: false },
  { src: 'chip', goal: 'Quick security pre-screen of example.com before we integrate, budget 50.', svc: 'vendor_security_assessment', strict: false },
  { src: 'para', goal: 'Before we route production traffic through cdn.acme.io, run a strict infrastructure security review, budget 85.', svc: 'vendor_security_assessment', strict: true },
  { src: 'para', goal: 'Check whether blog.acme.io loads quickly enough for launch, standard latency, budget 35.', svc: 'web_performance_probe', strict: false },
  { src: 'para', goal: "We're latency-critical — probe api.acme.io against a strict SLO, budget 65.", svc: 'web_performance_probe', strict: true },
];

async function plan(goal) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 70000);
  try {
    const r = await fetch(APP_URL + '/api/agent/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goalText: goal }), signal: ctrl.signal });
    return await r.json().catch(() => null);
  } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
  finally { clearTimeout(t); }
}

const short = (s) => (s.length > 46 ? s.slice(0, 44) + '…' : s).padEnd(46);
console.log(`Tacit planner smoke → ${APP_URL}\n`);
console.log('  src   goal                                             → service            policy                     ok');
console.log('  ' + '─'.repeat(112));

let good = 0;
for (const c of CASES) {
  const j = await plan(c.goal);
  const p = j?.proposal;
  const svcOk = p?.serviceType === c.svc;
  const strictOk = p ? (/strict/.test(p.policyId) === c.strict) : false;
  const valid = j?.ok === true && svcOk && strictOk;
  if (valid) good++;
  const svc = (p?.serviceType || '—').padEnd(18);
  const pol = (p?.policyId || j?.reason || '—').slice(0, 25).padEnd(25);
  console.log(`  ${c.src}  ${short(c.goal)} → ${svc} ${pol} ${valid ? '✅' : '❌' + (svcOk ? '' : ' svc') + (strictOk ? '' : ' policy')}`);
}

console.log('  ' + '─'.repeat(112));
console.log(`\n${good === CASES.length ? '✅' : '❌'} planner smoke: ${good}/${CASES.length} hard-gate-valid proposals with the expected service + policy family`);
process.exit(good === CASES.length ? 0 : 1);
