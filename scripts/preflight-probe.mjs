// Tacit — LIVE web_performance_probe e2e against real Canton devnet + 3 runners.
//
//   APP_URL=https://host node scripts/preflight-probe.mjs --require-ledger --require-runners
//
// Runs a fresh performance procurement: 3 runner bids, award+prepay, real 5-sample
// probe, buyer verification (hash+schema+target+SCORE-recompute), latency policy
// decision, per-party privacy, idempotent replay. Asserts STRUCTURE + verification +
// policy determinism GIVEN the report — NEVER absolute latency values (which vary).
import crypto from 'node:crypto';

const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };
const must = (c, m) => (c ? ok(m) : bad(m));
async function j(url, opts = {}, t = 180000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), t);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text }; }
  finally { clearTimeout(timer); }
}
const post = (p, b, t) => j(APP_URL + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }, t);

console.log(`Tacit performance probe e2e → ${APP_URL}\n`);

console.log('Readiness (BOTH services):');
const h = (await j(APP_URL + '/api/work/health', {}, 15000)).json;
const svcs = (await j(APP_URL + '/api/work/services', {}, 15000)).json;
must(h?.mode === 'devnet' && h?.ledgerReachable, 'devnet reachable');
must(h?.serviceQuorum?.web_performance_probe?.quorum === true, 'web_performance_probe has a 3-runner quorum');
must(h?.serviceQuorum?.vendor_security_assessment?.quorum === true, 'vendor_security_assessment still has a 3-runner quorum');
must((svcs?.services || []).find((s) => s.id === 'web_performance_probe')?.available === true, '/api/work/services shows perf available');
must((h?.runners || []).every((r) => (r.services || []).includes('web_performance_probe')), 'all runners advertise the perf capability');
if (fails) { console.error('\n❌ readiness failed'); process.exit(1); }

console.log('\nPerformance procurement (https://example.com, latency-slo-standard-v1):');
const jobId = 'pjob-' + sha256(APP_URL + Date.now()).slice(0, 12);
const body = { jobId, serviceType: 'web_performance_probe', input: { url: 'https://example.com' }, maxBudget: 100, policyId: 'latency-slo-standard-v1', buyerName: 'Judge-Agent' };
const res = await post('/api/work/procure', body, 180000);
if (res.status !== 200 || !res.json?.ok) { console.error(`❌ procure failed (HTTP ${res.status}): ${(res.text || '').slice(0, 300)}`); process.exit(1); }
const w = res.json; const ev = w.evidence || {}; const art = w.artifact || {}; const rep = art.report || {}; const vis = w.visibility || {}; const pol = w.policy;
const winnerLabel = w.winner?.providerLabel;
const loserLabel = ['providerA', 'providerB', 'providerC'].find((l) => l !== winnerLabel);

must(w.serviceType === 'web_performance_probe' && w.schema === 2, 'schema 2 + perf service');
must(Array.isArray(w.bids) && w.bids.length === 3 && new Set(w.bids.map((b) => b.provider)).size === 3, '3 bids from 3 distinct provider parties');
must(!!ev.settlementContractId && !!ev.assignmentContractId && !!ev.deliveryContractId && !!ev.receiptContractId, 'settlement + assignment + delivery + receipt created');

console.log('\nReal probe (structure only — never absolute latency):');
must(rep.service === 'web_performance_probe' && rep.version === 1, 'report is web_performance_probe v1');
must(rep.target?.inputUrl === 'https://example.com' && rep.target?.ipPinned === true, 'report binds to the requested target + IP-pinned');
must(Array.isArray(rep.samples) && rep.samples.length === 5, 'exactly 5 measurement samples');
must(rep.samples.every((s) => ['connectMs', 'tlsMs', 'ttfbMs', 'totalMs', 'status', 'bytesRead'].every((k) => typeof s[k] === 'number')), 'each sample carries measured numbers');
must(rep.aggregates?.ttfb && rep.aggregates?.tls && rep.aggregates?.total, 'aggregates present (ttfb/tls/total)');
must(typeof rep.protocol?.httpVersion === 'string', `ALPN HTTP version observed (${rep.protocol?.httpVersion})`);
must(['fast', 'moderate', 'slow', 'poor'].includes(rep.score?.band) && typeof rep.score?.value === 'number', `score band present (${rep.score?.band})`);
must(!JSON.stringify(rep).toLowerCase().includes('fixture') && !JSON.stringify(rep).toLowerCase().includes('mock'), 'no fixture/mock marker');

console.log('\nBuyer verification + policy (deterministic GIVEN the report):');
must(art.available === true && art.verifiedThisRequest === true && w.buyerVerification?.verified === true, 'buyer verified (hash+length+schema+binding+score)');
must(sha256(JSON.stringify(rep)) === art.providerCommittedSha256 && art.buyerComputedSha256 === art.providerCommittedSha256, 'independent buyer re-hash == provider commitment');
// recompute the score from the report's OWN breakdown (pure function; no latency values used):
const sum = Math.max(0, Math.min(100, Math.round((rep.score?.scoringBreakdown || []).reduce((s, c) => s + c.points, 0))));
must(sum === rep.score?.value, 'score recomputes exactly from scoringBreakdown (pure function)');
must(!!pol && ['approve', 'approve_with_conditions', 'human_review', 'reject'].includes(pol.decision), `latency policy decision (${pol?.decision})`);
must(pol?.serviceType === 'web_performance_probe' && pol?.policyId === 'latency-slo-standard-v1', 'policy is the service-scoped latency policy');
must(pol?.reasonCodes?.some((r) => r.startsWith('band:')), 'decision reasons reference the band/aggregates');

console.log('\nPrivacy (real per-party snapshot):');
must(vis.available === true, 'visibility snapshot available');
const bBuyer = new Set(vis.bids?.buyer || []), bA = new Set(vis.bids?.providerA || []), bB = new Set(vis.bids?.providerB || []), bC = new Set(vis.bids?.providerC || []);
const disjoint = (x, y) => [...x].every((c) => !y.has(c));
must(bBuyer.size >= 3 && bA.size >= 1 && disjoint(bA, bB) && disjoint(bA, bC) && disjoint(bB, bC), "buyer sees all bids; no provider sees a competitor's");
must((vis.bids?.auditor || []).length === 0, 'auditor sees ZERO sealed bids');
must(vis.privateDelivery?.buyer && vis.privateDelivery?.auditor === false && vis.privateDelivery?.[loserLabel] === false, 'private report: buyer + winner only');

console.log('\nIdempotency:');
const w2 = (await post('/api/work/procure', body, 120000)).json;
must(w2?.ok && w2.evidence?.settlementContractId === ev.settlementContractId && w2.evidence?.receiptContractId === ev.receiptContractId, 'replay reuses the SAME settlement + receipt (no double pay)');
must(w2?.resumption?.resumed === true && w2?.artifact?.verifiedThisRequest === false, 'replay honestly resumed');

console.log('\n=== PROBE EVIDENCE ===');
console.log(JSON.stringify({
  capturedAtUtc: new Date().toISOString(), mode: w.mode, service: `${w.serviceType} v${w.serviceVersion}`,
  target: rep.target?.inputUrl, httpVersion: rep.protocol?.httpVersion, medianTtfbMs: rep.aggregates?.ttfb?.medianMs,
  band: rep.score?.band, score: rep.score?.value, findings: rep.findings?.length,
  decision: pol?.decision, policy: pol?.policyId, winner: winnerLabel, amount: `${w.amount} ${w.currency}`,
  settlement: ev.settlementContractId, receipt: ev.receiptContractId,
  providerCommittedSha256: art.providerCommittedSha256, buyerComputedSha256: art.buyerComputedSha256,
}, null, 2));

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Performance probe e2e — real 5-sample probe, buyer-verified with score recompute, latency policy decided, privacy enforced, idempotent. Second service, zero Daml changes.');
process.exit(fails ? 1 : 0);
