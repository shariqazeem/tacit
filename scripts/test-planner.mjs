// Unit tests for the PURE planner decision logic (repair-retry + fallback) and the
// hard gate integration — no mock server; the model call is injected. Run:
//   node scripts/test-planner.mjs   (after `cd runner && npm run build`)
import assert from 'node:assert';
import { extractJson, buildRepairUser, resolveModels, planWithRepairAndFallback } from '../runner/dist/_agentPlanner.js';
import { validateAgentPlan } from '../runner/dist/_shared.js';

let pass = 0;
const ok = (m) => { console.log('  ✅ ' + m); pass++; };

// The real hard gate, with everything available (so validity turns only on the JSON).
const gate = (obj) => validateAgentPlan(obj, () => true);
const VALID = JSON.stringify({ serviceType: 'vendor_security_assessment', input: { url: 'https://acme.com' }, policyId: 'standard-saas-v1', maxBudget: 40, confidence: 0.9, assumptions: [] });
const WRONG_POLICY = JSON.stringify({ serviceType: 'vendor_security_assessment', input: { url: 'https://acme.com' }, policyId: 'latency-slo-standard-v1', maxBudget: 40 }); // policy mismatch → gate rejects
const M = (label) => ({ model: 'm', base: 'https://x/v1', key: 'k', label });

console.log('extractJson:');
{
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here:\n```json\n{"a":2}\n``` done'), { a: 2 }, 'tolerates prose/fences around JSON');
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{bad'), null);
  assert.equal(extractJson(null), null);
  ok('extracts JSON from prose; returns null on garbage/none');
}

console.log('\nbuildRepairUser:');
{
  const u = buildRepairUser('vet acme.com', '{"serviceType":"x"}', 'unknown policy "?"');
  assert.ok(u.includes('vet acme.com') && u.includes('unknown policy') && u.includes('{"serviceType":"x"}'), 'repair prompt carries goal + bad output + reason');
  ok('repair prompt feeds back the goal, the bad output, and the exact reason');
}

console.log('\nresolveModels (fallback selection):');
{
  const one = resolveModels({ TACIT_LLM_API_KEY: 'k', TACIT_LLM_MODEL: 'primary-m' });
  assert.equal(one.length, 1, 'no fallback env → exactly one model (current behavior)');
  assert.equal(one[0].label, 'primary');

  const two = resolveModels({ TACIT_LLM_API_KEY: 'k', TACIT_LLM_MODEL: 'primary-m', TACIT_LLM_FALLBACK_MODEL: 'fb-m' });
  assert.equal(two.length, 2, 'fallback model env → two models');
  assert.equal(two[1].label, 'fallback:fb-m');
  assert.equal(two[1].key, 'k', 'fallback inherits primary key when its own is absent');
  assert.equal(two[1].base, two[0].base, 'fallback inherits primary base when absent');

  const distinct = resolveModels({ TACIT_LLM_API_KEY: 'k1', TACIT_LLM_FALLBACK_MODEL: 'fb', TACIT_LLM_FALLBACK_BASE_URL: 'https://y/v1', TACIT_LLM_FALLBACK_API_KEY: 'k2' });
  assert.equal(distinct[1].base, 'https://y/v1');
  assert.equal(distinct[1].key, 'k2', 'distinct fallback base/key honored');

  const noKeyFb = resolveModels({ TACIT_LLM_FALLBACK_MODEL: 'fb' }); // no key anywhere
  assert.equal(noKeyFb.length, 1, 'a keyless fallback is dropped');
  ok('fallback added only when configured (with a usable key); absent env = one model');
}

console.log('\nplanWithRepairAndFallback (orchestration):');
{
  // 1) fresh success — one call, no repair
  {
    let calls = 0;
    const r = await planWithRepairAndFallback('vet acme.com', 'SYS', [M('primary')], async () => { calls++; return VALID; }, gate);
    assert.ok(r.ok === true && r.proposal.serviceType === 'vendor_security_assessment', 'fresh valid → proposal');
    assert.equal(calls, 1, 'no repair when fresh is valid');
    assert.equal(r.attempts.length, 1);
  }
  // 2) malformed → REPAIR path (fresh bad JSON, repair valid), single model
  {
    const outs = ['not json at all', VALID];
    let i = 0;
    const r = await planWithRepairAndFallback('vet acme.com', 'SYS', [M('primary')], async () => outs[i++], gate);
    assert.ok(r.ok === true, 'repair recovered a valid proposal');
    assert.deepEqual(r.attempts.map((a) => `${a.phase}:${a.ok}`), ['fresh:false', 'repair:true'], 'fresh failed, repair succeeded');
  }
  // 3) gate-rejection (valid JSON but wrong policy) → repair path
  {
    const outs = [WRONG_POLICY, VALID];
    let i = 0;
    const r = await planWithRepairAndFallback('vet acme.com', 'SYS', [M('primary')], async () => outs[i++], gate);
    assert.ok(r.ok === true, 'gate-rejected fresh, repair fixed the policy');
  }
  // 4) FALLBACK-ABSENT path: single model, both fresh + repair fail → honest {ok:false}
  {
    let calls = 0;
    const r = await planWithRepairAndFallback('vet acme.com', 'SYS', [M('primary')], async () => { calls++; return 'garbage'; }, gate);
    assert.equal(r.ok, false, 'no fallback → honest failure, never fabricated');
    assert.equal(calls, 2, 'primary tried fresh + repair only (no phantom fallback)');
    assert.equal(r.attempts.length, 2);
  }
  // 5) FALLBACK-USED path: primary fresh+repair fail, fallback fresh succeeds
  {
    const seq = ['garbage', 'still garbage', VALID]; // primary fresh, primary repair, fallback fresh
    let i = 0;
    const r = await planWithRepairAndFallback('vet acme.com', 'SYS', [M('primary'), M('fallback:fb')], async () => seq[i++], gate);
    assert.ok(r.ok === true, 'fallback model recovered a valid proposal');
    assert.deepEqual(r.attempts.map((a) => a.model), ['primary', 'primary', 'fallback:fb'], 'primary twice, then fallback');
  }
  ok('fresh / repair / gate-repair / fallback-absent-failure / fallback-recovery all correct');
  ok('honesty: exhausted models → {ok:false}, never a fabricated proposal');
}

console.log(`\n✅ all ${pass} planner tests passed`);
