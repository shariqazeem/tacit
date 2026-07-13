// Unit tests for the PURE runner pricing model (node:assert, no framework).
// Run: cd runner && node dist/pricingTest.js  (after tsc).
import assert from 'node:assert';
import { computeInFlight, quotePrice, parseServiceCost, LOAD_COEF, type CostPolicy } from './pricing.js';

let pass = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; console.log('  ✅', name); } catch (e) { console.error('  ❌', name, '—', (e as Error).message); process.exitCode = 1; } };

// Specialist policy used across tests (A = security specialist).
const A: CostPolicy = { baseCost: 22, margin: 0.2, serviceCost: { vendor_security_assessment: 18, web_performance_probe: 26 } };
const B: CostPolicy = { baseCost: 21, margin: 0.2, serviceCost: { vendor_security_assessment: 20, web_performance_probe: 22 } };
const VIN = '{"url":"https://example.com"}';

console.log('computeInFlight (live, lost bids clear):');
t('zero when nothing pending', () => {
  assert.equal(computeInFlight({}, [], [], []), 0);
});
t('a LOST bid clears immediately (AWR gone, no assignment)', () => {
  // ran bid on j1..j5 historically; none of those AWRs are open now and none assigned → 0 in-flight
  const inFlight = computeInFlight({}, ['j1', 'j2', 'j3', 'j4', 'j5'], [], []);
  assert.equal(inFlight, 0, 'accumulated lost bids must NOT inflate load');
});
t('own bid on a STILL-OPEN request counts (awaiting award)', () => {
  // bid on j1,j2,j3; only j2's AWR is still open → 1 pending
  assert.equal(computeInFlight({}, ['j1', 'j2', 'j3'], ['j2'], []), 1);
});
t('won-but-undelivered raises in-flight; delivered clears', () => {
  assert.equal(computeInFlight({}, [], [], ['w1', 'w2']), 2, 'two won, none delivered');
  assert.equal(computeInFlight({ w1: 'deliv1' }, [], [], ['w1', 'w2']), 1, 'one delivered clears');
});
t('won + pending combine, no double-count', () => {
  // won w1 (undelivered) + pending bid on open j9 = 2
  assert.equal(computeInFlight({}, ['j9', 'old'], ['j9'], ['w1']), 2);
});

console.log('\nquotePrice (deterministic, per-service, load):');
t('zero in-flight → exactly the base policy price', () => {
  const base = 18 * 1.2; // serviceCost.vendor × (1+margin), complexity≈1.014 for this input
  const q = quotePrice(A, 'vendor_security_assessment', VIN, 100, 0);
  assert.ok(q >= base && q < base * 1.03, `zero-load quote ~base policy (${q} vs ~${base.toFixed(2)})`);
});
t('specialization: A cheaper at vendor, B cheaper at perf', () => {
  const aV = quotePrice(A, 'vendor_security_assessment', VIN, 100, 0);
  const bV = quotePrice(B, 'vendor_security_assessment', VIN, 100, 0);
  const aP = quotePrice(A, 'web_performance_probe', VIN, 100, 0);
  const bP = quotePrice(B, 'web_performance_probe', VIN, 100, 0);
  assert.ok(aV < bV, `A wins vendor (${aV} < ${bV})`);
  assert.ok(bP < aP, `B beats A at perf (${bP} < ${aP})`);
});
t('all specialist quotes sit ≤ 50% of the default budget (100) at zero load', () => {
  for (const p of [A, B]) for (const s of ['vendor_security_assessment', 'web_performance_probe'])
    assert.ok(quotePrice(p, s, VIN, 100, 0) <= 50, `${s} quote ≤ 50`);
});
t('in-flight load raises the quote monotonically', () => {
  const q0 = quotePrice(A, 'vendor_security_assessment', VIN, 100, 0);
  const q1 = quotePrice(A, 'vendor_security_assessment', VIN, 100, 1);
  const q2 = quotePrice(A, 'vendor_security_assessment', VIN, 100, 2);
  assert.ok(q1 > q0 && q2 > q1, `load surcharge monotone (${q0} < ${q1} < ${q2})`);
  assert.ok(Math.abs(q1 / q0 - (1 + LOAD_COEF)) < 0.001, 'one in-flight adds exactly LOAD_COEF');
});
t('one concurrent same-service job can flip A→B at vendor', () => {
  const aLoaded = quotePrice(A, 'vendor_security_assessment', VIN, 100, 1); // A busy
  const bIdle = quotePrice(B, 'vendor_security_assessment', VIN, 100, 0);
  assert.ok(bIdle < aLoaded, `B undercuts a load-1 A (${bIdle} < ${aLoaded})`);
});
t('deterministic: identical inputs → identical quote', () => {
  assert.equal(quotePrice(A, 'vendor_security_assessment', VIN, 100, 3), quotePrice(A, 'vendor_security_assessment', VIN, 100, 3));
});
t('unknown service falls back to baseCost', () => {
  const q = quotePrice(A, 'site_audit', VIN, 100, 0);
  const base = 22 * 1.2;
  assert.ok(q >= base && q < base * 1.03, `site_audit uses baseCost 22 (${q})`);
});
t('heavy load is capped at 98% of budget (when base fits under budget)', () => {
  // base perf 26 < budget*0.98 (39.2); huge load would exceed budget → capped at 39.2
  const q = quotePrice(A, 'web_performance_probe', VIN, 40, 20);
  assert.ok(q <= 40 * 0.98 && q > 26, `capped to budget, above base (${q})`);
});
t('never bids below cost: budget < base → quote floors at the base service cost', () => {
  const q = quotePrice(A, 'web_performance_probe', VIN, 10, 0); // budget 10 < base 26
  assert.equal(q, 26, 'floors at base service cost (buyer then rejects it as over-budget)');
});

console.log('\nparseServiceCost (safe):');
t('valid JSON parses to a number map', () => {
  assert.deepEqual(parseServiceCost('{"vendor_security_assessment":16,"web_performance_probe":27}', () => {}), { vendor_security_assessment: 16, web_performance_probe: 27 });
});
t('missing → {} (fallback to baseCost)', () => {
  assert.deepEqual(parseServiceCost(undefined, () => {}), {});
});
t('malformed → {} and warns once', () => {
  let warned = 0;
  assert.deepEqual(parseServiceCost('{not json', () => { warned++; }), {});
  assert.equal(warned, 1, 'warned exactly once');
});
t('partial / dirty values are filtered (only finite positives kept)', () => {
  assert.deepEqual(parseServiceCost('{"a":16,"b":"x","c":-4,"d":0}', () => {}), { a: 16 });
});
t('a JSON array is rejected (not an object of costs)', () => {
  let warned = 0;
  assert.deepEqual(parseServiceCost('[1,2,3]', () => { warned++; }), {});
  assert.equal(warned, 1);
});

console.log(`\n${process.exitCode ? '❌' : '✅'} all ${pass} pricing tests passed`);
