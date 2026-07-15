// Tacit — Spec F: run 8 REAL procurements through the public HTTPS API (the same
// endpoint the UI uses), mixing both services, including default-budget jobs and
// concurrent pairs (to exercise live load repricing). Genuine full-stack jobs:
// real sealed bids, real work, real verification, real receipts. Asserts ≥2
// distinct winners across the two services (the deterministic specialist outcome).
//
//   APP_URL=https://host node scripts/live-8jobs.mjs
import crypto from 'node:crypto';

const APP_URL = (process.env.APP_URL || 'https://tacit.80-225-209-190.sslip.io').replace(/\/$/, '');
const rid = () => crypto.randomBytes(5).toString('hex');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };

async function procure(job, tMs = 180000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), tMs);
  try {
    const r = await fetch(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job), signal: ctrl.signal });
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
  } catch (e) { return { status: 0, j: null, err: String(e?.message || e) }; }
  finally { clearTimeout(timer); }
}

const V = 'vendor_security_assessment', P = 'web_performance_probe';
const url = 'https://example.com';
// 8 jobs: 4 vendor + 4 perf; jobs 3&4 default budget; jobs 5&6 and 7&8 fired concurrently.
const spec = [
  { svc: V, budget: 60, policy: 'standard-saas-v1', note: 'vendor' },
  { svc: P, budget: 60, policy: 'latency-slo-standard-v1', note: 'perf' },
  { svc: V, budget: 100, policy: 'standard-saas-v1', note: 'vendor · DEFAULT budget' },
  { svc: P, budget: 100, policy: 'latency-slo-standard-v1', note: 'perf · DEFAULT budget' },
];
const concurrentA = [
  { svc: V, budget: 80, policy: 'standard-saas-v1', note: 'vendor · concurrent#1' },
  { svc: V, budget: 80, policy: 'standard-saas-v1', note: 'vendor · concurrent#2' },
];
const concurrentB = [
  { svc: P, budget: 80, policy: 'latency-slo-standard-v1', note: 'perf · concurrent#1' },
  { svc: P, budget: 80, policy: 'latency-slo-standard-v1', note: 'perf · concurrent#2' },
];

const results = [];
const toJob = (s) => ({ jobId: `live8-${rid()}`, serviceType: s.svc, input: { url }, maxBudget: s.budget, policyId: s.policy, buyerName: 'Judge-Agent' });

console.log(`Tacit 8-job live run → ${APP_URL}\n`);

// Sequential jobs 1–4 (2 of them at the default budget).
for (const s of spec) {
  const job = toJob(s);
  const { status, j, err } = await procure(job);
  const winner = j?.winner?.providerLabel; const amount = j?.amount; const bids = j?.bids?.length ?? 0;
  if (status === 200 && j?.ok) { ok(`${s.note}: winner ${winner} @ ${amount} (${bids} bids)`); results.push({ svc: s.svc, winner, amount, budget: s.budget, bids }); }
  else bad(`${s.note}: HTTP ${status} ${err || j?.error || ''}`);
  if (s.budget === 100) ((bids === 3) ? ok(`  ↳ default-budget job gathered 3 in-budget bids (un-killable)`) : bad(`  ↳ default-budget job gathered ${bids} bids`));
}

// Concurrent pair A (two vendor jobs at once → load repricing).
console.log('\nConcurrent vendor pair (live load repricing):');
{
  const [a, b] = await Promise.all([procure(toJob(concurrentA[0])), procure(toJob(concurrentA[1]))]);
  for (const [i, res] of [a, b].entries()) {
    if (res.status === 200 && res.j?.ok) { ok(`vendor concurrent#${i + 1}: winner ${res.j.winner?.providerLabel} @ ${res.j.amount}`); results.push({ svc: V, winner: res.j.winner?.providerLabel, amount: res.j.amount, budget: 80, bids: res.j.bids?.length ?? 0 }); }
    else bad(`vendor concurrent#${i + 1}: HTTP ${res.status} ${res.err || res.j?.error || ''}`);
  }
}

// Concurrent pair B (two perf jobs at once).
console.log('\nConcurrent perf pair (live load repricing):');
{
  const [a, b] = await Promise.all([procure(toJob(concurrentB[0])), procure(toJob(concurrentB[1]))]);
  for (const [i, res] of [a, b].entries()) {
    if (res.status === 200 && res.j?.ok) { ok(`perf concurrent#${i + 1}: winner ${res.j.winner?.providerLabel} @ ${res.j.amount}`); results.push({ svc: P, winner: res.j.winner?.providerLabel, amount: res.j.amount, budget: 80, bids: res.j.bids?.length ?? 0 }); }
    else bad(`perf concurrent#${i + 1}: HTTP ${res.status} ${res.err || res.j?.error || ''}`);
  }
}

console.log('\n=== 8-JOB WIN TABLE ===');
for (const r of results) console.log(`  ${r.svc === V ? 'vendor' : 'perf  '} · budget ${String(r.budget).padStart(3)} · ${r.bids} bids · winner ${r.winner} @ ${r.amount}`);
const winners = new Set(results.map((r) => r.winner).filter(Boolean));
const vendorWinners = new Set(results.filter((r) => r.svc === V).map((r) => r.winner));
const perfWinners = new Set(results.filter((r) => r.svc === P).map((r) => r.winner));
console.log(`\ndistinct winners overall: ${[...winners].join(', ')}`);
console.log(`vendor winners: ${[...vendorWinners].join(', ')} · perf winners: ${[...perfWinners].join(', ')}`);
(winners.size >= 2) ? ok(`≥2 distinct winners across the two services (${winners.size})`) : bad(`only ${winners.size} distinct winner`);
// Report (do not force) whether a load-flip handed B a win.
if (winners.has('Provider B')) console.log('  ▸ load-flip: Provider B won at least one job under live load.');
else console.log('  ▸ no load-flip win for B this run (fine — deterministic idle winners are A@vendor, C@perf).');

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ 8 real jobs completed; real competition with ≥2 distinct winners.');
process.exit(fails ? 1 : 0);
