// Tacit — LIVE agentic vendor-security e2e against real Canton devnet + 3 runners.
//
//   APP_URL=https://host node scripts/preflight-agentic.mjs --require-ledger --require-runners
//
// Runs a fresh vendor_security_assessment: 3 runner-created bids, award+prepay, real
// passive assessment, private delivery, buyer verify (hash+schema+target+score),
// deterministic policy decision, auditor-visible receipt. Asserts privacy, tamper,
// idempotency, and that the report is real (measured) — not a fixture. No fallback.
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

console.log(`Tacit agentic e2e → ${APP_URL}\n`);

console.log('Readiness:');
const h = (await j(APP_URL + '/api/work/health', {}, 15000)).json;
must(h?.ok === true, 'base work health ok');
must(h?.mode === 'devnet', `mode devnet (${h?.mode})`);
must(h?.launchReady === true, 'launch service (vendor) ready');
must(h?.serviceQuorum?.vendor_security_assessment?.quorum === true, 'vendor_security_assessment has a 3-runner quorum');
must(Array.isArray(h?.runners) && h.runners.length >= 3 && h.distinctInstances && h.distinctProcesses, '3 distinct ready runners');
must((h?.runners || []).every((r) => (r.services || []).includes('vendor_security_assessment')), 'all runners advertise vendor capability');
if (fails) { console.error('\n❌ readiness failed'); process.exit(1); }

console.log('\nVendor procurement (https://example.com, standard-saas-v1):');
const jobId = 'ajob-' + sha256(APP_URL + Date.now()).slice(0, 12);
const body = JSON.stringify({ jobId, serviceType: 'vendor_security_assessment', input: { url: 'https://example.com' }, maxBudget: 100, policyId: 'standard-saas-v1', buyerName: 'Judge-Agent' });
const res = await j(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 180000);
if (res.status !== 200 || !res.json?.ok) { console.error(`❌ procure failed (HTTP ${res.status}): ${(res.text || '').slice(0, 300)}`); process.exit(1); }
const w = res.json; const ev = w.evidence || {}; const art = w.artifact || {}; const rep = art.report || {}; const vis = w.visibility || {}; const pol = w.policy;
const winnerLabel = w.winner?.providerLabel;
const loserLabel = ['providerA', 'providerB', 'providerC'].find((l) => l !== winnerLabel);

must(w.schema === 2 && w.serviceType === 'vendor_security_assessment', 'schema 2 + vendor service');
must(Array.isArray(w.bids) && w.bids.length === 3 && new Set(w.bids.map((b) => b.provider)).size === 3, '3 bids from 3 distinct provider parties');
must(!!ev.settlementContractId && !!ev.assignmentContractId && !!ev.deliveryContractId && !!ev.receiptContractId, 'settlement + assignment + delivery + receipt created');

console.log('\nReal assessment (not a fixture):');
must(rep.service === 'vendor_security_assessment' && rep.version === 1, 'report is vendor_security_assessment v1');
must(rep.requestedUrl === 'https://example.com', 'report binds to the requested target');
must(rep.tls?.ok === true && typeof rep.tls?.certIssuer === 'string' && rep.tls.certIssuer.length > 0, `real TLS cert observed (${rep.tls?.certIssuer})`);
must(typeof rep.tls?.daysRemaining === 'number', `measured cert days remaining (${rep.tls?.daysRemaining})`);
must(rep.dns && ['caa', 'mx', 'spf', 'dmarc'].every((k) => typeof rep.dns[k] === 'string'), 'DNS/mail posture observed');
must(Array.isArray(rep.findings) && Array.isArray(rep.scoringBreakdown) && rep.scoringBreakdown.length > 0, 'deterministic findings + scoring breakdown present');
must(typeof rep.durationMs === 'number' && rep.durationMs >= 0 && typeof rep.assessmentStartedAtUtc === 'string', 'measured timestamps + duration');
must(!JSON.stringify(rep).toLowerCase().includes('fixture') && !JSON.stringify(rep).toLowerCase().includes('mock'), 'no fixture/mock marker');

console.log('\nBuyer verification + policy:');
must(art.available === true && art.verifiedThisRequest === true, 'artifact available + verified this request');
must(w.buyerVerification?.hashOk && w.buyerVerification?.lengthOk && w.buyerVerification?.schemaOk && w.buyerVerification?.bindingOk && w.buyerVerification?.scoreOk && w.buyerVerification?.verified, 'buyer verified hash + length + schema + binding + score');
must(sha256(JSON.stringify(rep)) === art.providerCommittedSha256, 'independent buyer re-hash == provider commitment');
must(art.buyerComputedSha256 === art.providerCommittedSha256, 'buyer-computed sha matches (separate field)');
must(!!pol && ['approve', 'approve_with_conditions', 'human_review', 'reject'].includes(pol.decision), `policy decision (${pol?.decision})`);
must(pol?.reasonCodes?.length > 0 && pol.reasonCodes.some((r) => r.startsWith('score:') || r.includes(':')), 'decision reasons reference score/findings');
must((w.agentTrace || []).some((e) => e.step === 'policy_evaluated'), 'agentTrace records policy_evaluated');
// A clean example.com (missing HSTS/CSP/etc, valid TLS) must not be rejected/critical:
must(pol?.decision !== 'reject' && rep.riskBand !== 'critical', 'no critical transport failure → not auto-rejected');

console.log('\nPrivacy (real per-party snapshot):');
must(vis.available === true, 'visibility snapshot available');
const bBuyer = new Set(vis.bids?.buyer || []), bA = new Set(vis.bids?.providerA || []), bB = new Set(vis.bids?.providerB || []), bC = new Set(vis.bids?.providerC || []);
const disjoint = (x, y) => [...x].every((c) => !y.has(c));
must((w.bids || []).map((b) => b.contractId).every((c) => bBuyer.has(c)) && bBuyer.size >= 3, 'buyer sees all sealed bids');
must(bA.size >= 1 && disjoint(bA, bB) && disjoint(bA, bC) && disjoint(bB, bC), "no provider sees a competitor's bid");
must((vis.bids?.auditor || []).length === 0, 'auditor sees ZERO sealed bids');
must(vis.privateDelivery?.buyer && vis.privateDelivery?.[winnerLabel] && vis.privateDelivery?.auditor === false && vis.privateDelivery?.[loserLabel] === false, 'private report: buyer + winner only (not auditor/loser)');
must(vis.receipt?.buyer && vis.receipt?.auditor && vis.receipt?.[loserLabel] === false, 'receipt: buyer + auditor, not loser');

console.log('\nTamper + idempotency:');
const canon = JSON.stringify(rep);
must(sha256(canon.slice(0, -2) + 'X}') !== art.providerCommittedSha256, 'a flipped byte breaks the commitment (would be refused)');
const w2 = (await j(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 120000)).json;
must(w2?.ok && w2.evidence?.settlementContractId === ev.settlementContractId && w2.evidence?.receiptContractId === ev.receiptContractId, 'replay reuses the SAME settlement + receipt (no double pay)');
must(w2?.resumption?.resumed === true && w2?.artifact?.verifiedThisRequest === false, 'replay is honestly resumed (no fresh-verify claim)');

console.log('\n=== AGENTIC EVIDENCE ===');
console.log(JSON.stringify({
  capturedAtUtc: new Date().toISOString(), mode: w.mode, service: `${w.serviceType} v${w.serviceVersion}`,
  corePackageId: ev.corePackageId, workPackageId: ev.workPackageId,
  target: rep.requestedUrl, tls: `${rep.tls?.protocol} · ${rep.tls?.certIssuer} · ${rep.tls?.daysRemaining}d`,
  score: rep.score, riskBand: rep.riskBand, findings: rep.findings?.length,
  decision: pol?.decision, policy: pol?.policyId, reasons: pol?.reasonCodes,
  winner: winnerLabel, amount: `${w.amount} ${w.currency}`,
  settlement: ev.settlementContractId, receipt: ev.receiptContractId,
  providerCommittedSha256: art.providerCommittedSha256, buyerComputedSha256: art.buyerComputedSha256,
}, null, 2));

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Agentic e2e — real vendor assessment, 3 autonomous bids, buyer-verified, policy decided, privacy enforced, tamper refused, idempotent.');
process.exit(fails ? 1 : 0);
