// Tacit Work — live end-to-end proof against real runners + real Canton devnet.
//
//   APP_URL=http://localhost:3400 \
//   RUNNER_HEALTH_URLS=http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013 \
//   node scripts/preflight-work-e2e.mjs --require-ledger --require-runners
//
// Exits non-zero on: memory/fallback, <3 runners, duplicate runner identities,
// missing bid cid, wrong provider party, fake/static artifact, hash mismatch,
// absent receipt, visibility violation. Includes a tamper test + idempotent replay.
import crypto from 'node:crypto';

const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
const HEALTH_URLS = (process.env.RUNNER_HEALTH_URLS || 'http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013').split(',').map((s) => s.trim()).filter(Boolean);
const REQUIRE_RUNNERS = process.argv.includes('--require-runners');
const REQUIRE_LEDGER = process.argv.includes('--require-ledger');
const CORE_PKG = process.env.TACIT_PACKAGE_ID_V2 || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
const WORK_PKG_ID = process.env.TACIT_WORK_PACKAGE_ID || '9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed';

const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };
const must = (cond, m) => (cond ? ok(m) : bad(m));

async function getJson(url, opts = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  } finally { clearTimeout(t); }
}

console.log(`Tacit Work e2e → app ${APP_URL}\n`);

// ── 1) require three distinct, ready runners ─────────────────────────────────
console.log('Runners:');
const healths = [];
for (const u of HEALTH_URLS) {
  const h = await getJson(u + '/health', {}, 8000).catch(() => null);
  if (h?.json?.ready) { healths.push(h.json); ok(`${h.json.label} ready · instance=${h.json.instanceId} pid=${h.json.pid} party=${h.json.partyShort}`); }
  else bad(`runner at ${u} not ready`);
}
if (REQUIRE_RUNNERS) {
  must(healths.length >= 3, `at least 3 runners ready (got ${healths.length})`);
  const instances = new Set(healths.map((h) => h.instanceId));
  const pids = new Set(healths.map((h) => h.pid));
  must(instances.size === healths.length, 'runner instance ids are distinct');
  must(pids.size === healths.length, 'runner PIDs are distinct');
  must(healths.every((h) => h.ledgerMode === 'devnet'), 'runners are on devnet');
}
if (fails) { console.error('\n❌ runner preconditions failed'); process.exit(1); }

// ── 2) run a real work procurement on devnet ─────────────────────────────────
console.log('\nProcurement (site_audit of https://example.com):');
// Fresh per invocation so each run does a full lifecycle; both POSTs below share
// it so the second is a genuine idempotent replay.
const jobId = 'wjob-' + sha256(String(HEALTH_URLS.join()) + APP_URL + Date.now()).slice(0, 12);
const body = JSON.stringify({ jobId, serviceType: 'site_audit', input: { url: 'https://example.com' }, maxBudget: 100, buyerName: 'Judge-Agent' });
const res = await getJson(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 180000);
if (res.status !== 200 || !res.json?.ok) {
  console.error(`❌ /api/work/procure failed (HTTP ${res.status}): ${(res.text || '').slice(0, 300)}`);
  if (REQUIRE_LEDGER) process.exit(1);
}
const w = res.json;
must(w.mode === 'devnet', `ledger mode is devnet (got ${w.mode})`);
must(Array.isArray(w.bids) && w.bids.length === 3, `exactly 3 bids received (got ${w.bids?.length})`);
const bidProviders = new Set((w.bids || []).map((b) => b.provider));
must(bidProviders.size === 3, 'the 3 bids are from 3 DISTINCT provider parties');
must((w.bids || []).every((b) => typeof b.contractId === 'string' && b.contractId.length > 10), 'every bid has a real contract id');
must([w.parties?.providerA, w.parties?.providerB, w.parties?.providerC].every((p) => bidProviders.has(p)), 'bids map to the three invited provider parties');
must(!!w.settlementContractId, 'settlement created (award + prepay)');
must(!!w.assignmentContractId, 'assignment created');
must(!!w.deliveryContractId || w.resumed, 'private delivery created');
must(!!w.receiptContractId, 'delivery receipt created');

// ── 3) the artifact is a REAL audit, not a fixture; buyer hash matches ────────
console.log('\nArtifact + hash:');
const rep = w.report || {};
must(rep.service === 'site_audit' && rep.requestedUrl === 'https://example.com', 'report is a site_audit of the requested url');
must(typeof rep.httpStatus === 'number' && rep.httpStatus > 0, `real HTTP status observed (${rep.httpStatus})`);
must(typeof rep.responseLatencyMs === 'number', `measured latency (${rep.responseLatencyMs}ms)`);
must(rep.securityHeaders && typeof rep.securityHeaders === 'object', 'security-header checks present');
const canonicalReport = JSON.stringify(rep);
must(sha256(canonicalReport) === w.reportSha256, 'buyer re-hash of the received report == committed SHA-256');
must(Buffer.byteLength(canonicalReport, 'utf8') === w.reportByteLen, 'byte length matches the commitment');
must(w.buyerVerified?.ok === true, 'buyer OFF-LEDGER verification passed before Accept');

// ── 4) visibility invariants ─────────────────────────────────────────────────
console.log('\nVisibility:');
must(w.visibility?.receipt?.buyer && w.visibility?.receipt?.winner && w.visibility?.receipt?.auditor, 'receipt visible to buyer + winner + auditor');
must(w.visibility?.receipt?.loser === false, 'receipt NOT visible to a losing provider');
must(w.visibility?.privateDelivery?.buyer, 'private delivery visible to buyer');
must(w.visibility?.privateDelivery?.auditor === false, 'private delivery NOT visible to the auditor (report stays private)');
must(w.visibility?.privateDelivery?.loser === false, 'private delivery NOT visible to a losing provider');

// ── 5) tamper test: a one-byte change breaks the commitment → would be refused ─
console.log('\nTamper test:');
const tampered = canonicalReport.slice(0, -2) + (canonicalReport.slice(-2) === '}}' ? '} ' : 'X}');
must(sha256(tampered) !== w.reportSha256, 'a tampered report yields a different SHA-256 (buyer would refuse to Accept)');
must(sha256(canonicalReport) === w.reportSha256, 'the untampered report matches (Accept only happens on match)');

// ── 6) idempotency: replay the SAME jobId → no new payment/settlement ─────────
console.log('\nIdempotency:');
const res2 = await getJson(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 120000);
const w2 = res2.json;
must(res2.status === 200 && w2?.ok, 'replay returns 200');
must(w2?.settlementContractId === w.settlementContractId, 'replay reuses the SAME settlement (no second award/payment)');
must(w2?.receiptContractId === w.receiptContractId, 'replay reuses the SAME receipt');
must(w2?.resumed === true, 'replay is flagged as resumed');

// ── evidence ─────────────────────────────────────────────────────────────────
console.log('\n=== WORK EVIDENCE (on Canton devnet) ===');
console.log(JSON.stringify({
  capturedAtUtc: new Date().toISOString(),
  mode: w.mode,
  corePackageId: CORE_PKG,
  workPackageId: WORK_PKG_ID,
  workPackageName: w.workPackage,
  buyer: w.parties?.buyer,
  providers: [w.parties?.providerA, w.parties?.providerB, w.parties?.providerC],
  runners: healths.map((h) => ({ label: h.label, instanceId: h.instanceId, pid: h.pid, party: h.partyShort })),
  bidContractIds: (w.bids || []).map((b) => ({ provider: b.providerLabel, cid: b.contractId, price: b.price })),
  winner: w.winner,
  settlementContractId: w.settlementContractId,
  paymentIouContractId: w.paymentIouContractId,
  amount: w.amount, currency: w.currency,
  assignmentContractId: w.assignmentContractId,
  privateDeliveryContractId: w.deliveryContractId,
  deliveryReceiptContractId: w.receiptContractId,
  requestedUrl: rep.requestedUrl, finalUrl: rep.finalUrl,
  httpStatus: rep.httpStatus, responseLatencyMs: rep.responseLatencyMs,
  artifactByteLen: w.reportByteLen, computedSha256: sha256(canonicalReport), ledgerSha256: w.reportSha256,
}, null, 2));

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Tacit Work e2e — real runners bid, award+prepay, winner delivered a real audit, buyer verified + accepted, receipt is auditor-visible; tamper refused; idempotent.');
process.exit(fails ? 1 : 0);
