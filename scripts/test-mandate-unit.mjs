// Tacit — pure spending-mandate logic unit tests (node:assert). Imports the
// COMPILED shared module (runner/dist/_mandate.js). Run: node scripts/test-mandate-unit.mjs
// (after `cd runner && npm run build`).
import assert from 'node:assert';
import { mandateEnabled, precheckMandate, pickEligibleMandate, findExistingAuthorization, MANDATE_INSUFFICIENT } from '../runner/dist/_mandate.js';

let pass = 0;
const ok = (m) => { console.log('  ✅ ' + m); pass++; };
const NOW = '2026-07-19T00:00:00.000Z';
const mkM = (over = {}) => ({ contractId: 'm1', principal: 'P', agent: 'A', label: 'Standing', currency: 'USD.demo', limit: 500, remaining: 500, allowedServices: [], expiresAtUtc: null, ...over });

// ── flag ──────────────────────────────────────────────────────────────────
assert.equal(mandateEnabled({}), false, 'unset = off');
assert.equal(mandateEnabled({ TACIT_MANDATE_MODE: 'off' }), false, 'off');
assert.equal(mandateEnabled({ TACIT_MANDATE_MODE: 'on' }), true, 'on');
assert.equal(mandateEnabled({ TACIT_MANDATE_MODE: 'ON' }), true, 'ON case-insensitive');
ok('mandateEnabled: unset/off=false, on=true (bit-for-bit gate)');

// ── precheck: sufficient ────────────────────────────────────────────────────
{
  const r = precheckMandate([mkM({ remaining: 500 })], 100, 'vendor_security_assessment', NOW);
  assert.equal(r.ok, true);
  assert.equal(r.mandate.contractId, 'm1');
  ok('precheck: remaining 500 ≥ 100 ceiling → ok');
}

// ── precheck: insufficient remaining ────────────────────────────────────────
{
  const r = precheckMandate([mkM({ remaining: 40 })], 100, 'vendor_security_assessment', NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, MANDATE_INSUFFICIENT);
  assert.ok(/40 demo credits remaining/.test(r.reason), 'reason names the shortfall');
  ok('precheck: remaining 40 < 100 ceiling → MANDATE_INSUFFICIENT');
}

// ── precheck: no mandate at all ─────────────────────────────────────────────
{
  const r = precheckMandate([], 100, 'vendor_security_assessment', NOW);
  assert.equal(r.ok, false);
  assert.equal(r.code, MANDATE_INSUFFICIENT);
  assert.ok(/no spending mandate/i.test(r.reason));
  ok('precheck: no mandate granted → MANDATE_INSUFFICIENT');
}

// ── precheck: expired ───────────────────────────────────────────────────────
{
  const r = precheckMandate([mkM({ expiresAtUtc: '2020-01-01T00:00:00.000Z' })], 100, 'vendor_security_assessment', NOW);
  assert.equal(r.ok, false);
  assert.ok(/expired/.test(r.reason));
  ok('precheck: expired mandate → refused');
}

// ── precheck: service scope ─────────────────────────────────────────────────
{
  const scoped = mkM({ allowedServices: ['web_performance_probe'] });
  const bad = precheckMandate([scoped], 100, 'vendor_security_assessment', NOW);
  assert.equal(bad.ok, false);
  assert.ok(/permits vendor_security_assessment/.test(bad.reason));
  const good = precheckMandate([scoped], 100, 'web_performance_probe', NOW);
  assert.equal(good.ok, true);
  ok('precheck: service scope enforced (scoped mandate rejects other service, permits its own)');
}

// ── selection: prefers the mandate with the most remaining; deterministic ────
{
  const a = mkM({ contractId: 'a', remaining: 100 });
  const b = mkM({ contractId: 'b', remaining: 300 });
  const c = mkM({ contractId: 'c', remaining: 300 });
  assert.equal(pickEligibleMandate([a, b, c], 'vendor_security_assessment', NOW).contractId, 'b', 'most remaining; ties by contractId');
  assert.equal(pickEligibleMandate([], 'x', NOW), null, 'none → null');
  ok('pickEligibleMandate: most-remaining, tie-broken by contractId, deterministic');
}

// ── idempotent authorization resolution ─────────────────────────────────────
{
  const auths = [
    { contractId: 'x1', jobId: 'j1', amount: 31.77, serviceType: 'vendor_security_assessment', authorizedAtUtc: NOW },
    { contractId: 'x2', jobId: 'j2', amount: 20, serviceType: 'web_performance_probe', authorizedAtUtc: NOW },
  ];
  assert.equal(findExistingAuthorization(auths, 'j1').contractId, 'x1', 'existing auth for j1 found');
  assert.equal(findExistingAuthorization(auths, 'j9'), null, 'no auth for j9 → null (safe to authorize)');
  ok('findExistingAuthorization: resume reuses an existing auth; new job → null (no double-spend)');
}

console.log(`\n✅ all ${pass} mandate unit tests passed`);
