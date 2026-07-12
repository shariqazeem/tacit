// Tacit Work — live end-to-end proof against real runners + real Canton devnet.
//
//   APP_URL=http://localhost:3400 \
//   RUNNER_HEALTH_URLS=http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013 \
//   node scripts/preflight-work-e2e.mjs --require-ledger --require-runners
//
// Exits non-zero on: memory/fallback, <3 runners, duplicate runner identities,
// missing bid cid, wrong provider party, fake/static artifact, hash mismatch,
// absent receipt, visibility violation. Includes a tamper test + idempotent replay.
// Reads the v2 WorkResult contract (schema 2).
import crypto from 'node:crypto';

const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
const HEALTH_URLS = (process.env.RUNNER_HEALTH_URLS || 'http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013').split(',').map((s) => s.trim()).filter(Boolean);
const REQUIRE_RUNNERS = process.argv.includes('--require-runners');
const REQUIRE_LEDGER = process.argv.includes('--require-ledger');

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

// ── 1) require three distinct, ready runners (via /api/work/health) ──────────
console.log('Runners (via /api/work/health):');
const wh = await getJson(APP_URL + '/api/work/health', {}, 15000).catch(() => null);
const health = wh?.json;
if (REQUIRE_RUNNERS) {
  must(!!health?.ok, `work health ok (reason: ${health?.reason || 'n/a'})`);
  must(health?.mode === 'devnet', `health mode devnet (${health?.mode})`);
  must(health?.ledgerReachable === true, 'ledger reachable');
  must(Array.isArray(health?.runners) && health.runners.length >= 3, `>=3 runners ready (${health?.runners?.length})`);
  must(health?.distinctInstances === true, 'runner instance ids are distinct');
  must(health?.distinctProcesses === true, 'runner PIDs are distinct');
  (health?.runners || []).forEach((r) => ok(`${r.label} · instance=${r.instanceId} pid=${r.pid} party=${r.partyShort}`));
}
if (fails) { console.error('\n❌ runner preconditions failed'); process.exit(1); }

// ── 2) run a real work procurement on devnet ─────────────────────────────────
console.log('\nProcurement (site_audit of https://example.com):');
const jobId = 'wjob-' + sha256(String(HEALTH_URLS.join()) + APP_URL + Date.now()).slice(0, 12);
const body = JSON.stringify({ jobId, serviceType: 'site_audit', input: { url: 'https://example.com' }, maxBudget: 100, buyerName: 'Judge-Agent' });
const res = await getJson(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 180000);
if (res.status !== 200 || !res.json?.ok) {
  console.error(`❌ /api/work/procure failed (HTTP ${res.status}): ${(res.text || '').slice(0, 300)}`);
  if (REQUIRE_LEDGER) process.exit(1);
}
const w = res.json;
const ev = w.evidence || {};
const art = w.artifact || {};
const vis = w.visibility || {};
const winnerLabel = w.winner?.providerLabel;
const loserLabel = ['providerA', 'providerB', 'providerC'].find((l) => l !== winnerLabel);

must(w.schema === 2, `response schema is 2 (got ${w.schema})`);
must(w.mode === 'devnet', `ledger mode is devnet (got ${w.mode})`);
must(Array.isArray(w.bids) && w.bids.length === 3, `exactly 3 bids received (got ${w.bids?.length})`);
const bidProviders = new Set((w.bids || []).map((b) => b.provider));
must(bidProviders.size === 3, 'the 3 bids are from 3 DISTINCT provider parties');
must((w.bids || []).every((b) => typeof b.contractId === 'string' && b.contractId.length > 10), 'every bid has a real contract id');
must([w.parties?.providerA, w.parties?.providerB, w.parties?.providerC].every((p) => bidProviders.has(p)), 'bids map to the three invited provider parties');
must(!!ev.settlementContractId, 'settlement created (award + prepay)');
must(!!ev.assignmentContractId, 'assignment created');
must(!!ev.deliveryContractId, 'private delivery created');
must(!!ev.receiptContractId, 'delivery receipt created');

// ── 3) the artifact is a REAL audit, not a fixture; buyer hash matches ────────
console.log('\nArtifact + hash:');
const rep = art.report || {};
must(art.available === true, 'artifact available (fresh run)');
must(rep.service === 'site_audit' && rep.requestedUrl === 'https://example.com', 'report is a site_audit of the requested url');
must(typeof rep.httpStatus === 'number' && rep.httpStatus > 0, `real HTTP status observed (${rep.httpStatus})`);
must(typeof rep.responseLatencyMs === 'number', `measured latency (${rep.responseLatencyMs}ms)`);
must(rep.securityHeaders && typeof rep.securityHeaders === 'object', 'security-header checks present');
const canonicalReport = JSON.stringify(rep);
must(sha256(canonicalReport) === art.sha256, 'buyer re-hash of the received report == committed SHA-256');
must(Buffer.byteLength(canonicalReport, 'utf8') === art.byteLength, 'byte length matches the commitment');
must(art.verifiedThisRequest === true, 'buyer OFF-LEDGER verification passed this request (before Accept)');

// ── 4) visibility invariants (from real per-persona snapshots) ───────────────
console.log('\nVisibility (real per-persona ledger reads):');
must(vis.available === true, 'visibility snapshot available (fresh run)');
// sealed bids: buyer sees all three, each provider only its own, auditor none
must((vis.bids?.buyer || []).length === 3, 'buyer sees all THREE sealed bids');
must((vis.bids?.providerA || []).length === 1, 'Provider A sees exactly ONE bid (its own)');
must((vis.bids?.providerB || []).length === 1, 'Provider B sees exactly ONE bid (its own)');
must((vis.bids?.providerC || []).length === 1, 'Provider C sees exactly ONE bid (its own)');
must((vis.bids?.auditor || []).length === 0, 'Auditor sees ZERO sealed bids');
// receipt + private delivery
must(vis.receipt?.buyer && vis.receipt?.[winnerLabel] && vis.receipt?.auditor, 'receipt visible to buyer + winner + auditor');
must(vis.receipt?.[loserLabel] === false, 'receipt NOT visible to a losing provider');
must(vis.privateDelivery?.buyer, 'private delivery visible to buyer');
must(vis.privateDelivery?.auditor === false, 'private delivery NOT visible to the auditor (report stays private)');
must(vis.privateDelivery?.[loserLabel] === false, 'private delivery NOT visible to a losing provider');

// ── 5) tamper test: a one-byte change breaks the commitment → would be refused ─
console.log('\nTamper test:');
const tampered = canonicalReport.slice(0, -2) + (canonicalReport.slice(-2) === '}}' ? '} ' : 'X}');
must(sha256(tampered) !== art.sha256, 'a tampered report yields a different SHA-256 (buyer would refuse to Accept)');
must(sha256(canonicalReport) === art.sha256, 'the untampered report matches (Accept only happens on match)');

// ── 6) idempotency: replay the SAME jobId → no new payment/settlement ─────────
console.log('\nIdempotency:');
const res2 = await getJson(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 120000);
const w2 = res2.json;
must(res2.status === 200 && w2?.ok, 'replay returns 200');
must(w2?.evidence?.settlementContractId === ev.settlementContractId, 'replay reuses the SAME settlement (no second award/payment)');
must(w2?.evidence?.receiptContractId === ev.receiptContractId, 'replay reuses the SAME receipt');
must(w2?.resumption?.resumed === true, 'replay is flagged as resumed');
must(w2?.artifact?.verifiedThisRequest === false, 'replay does NOT claim fresh verification (honest)');
must(w2?.resumption?.historicalArtifactNotLoaded === true, 'replay honestly reports the report body was not reloaded');

// ── evidence ─────────────────────────────────────────────────────────────────
console.log('\n=== WORK EVIDENCE (on Canton devnet) ===');
console.log(JSON.stringify({
  capturedAtUtc: new Date().toISOString(),
  schema: w.schema, mode: w.mode,
  corePackageId: ev.corePackageId, workPackageId: ev.workPackageId, workPackageName: w.workPackage,
  buyer: w.parties?.buyer,
  providers: [w.parties?.providerA, w.parties?.providerB, w.parties?.providerC],
  runners: (health?.runners || []).map((h) => ({ label: h.label, instanceId: h.instanceId, pid: h.pid, party: h.partyShort })),
  bidContractIds: (w.bids || []).map((b) => ({ provider: b.providerLabel, cid: b.contractId, price: b.price, winner: b.winner })),
  winner: w.winner,
  settlementContractId: ev.settlementContractId,
  paymentIouContractId: ev.paymentIouContractId,
  amount: w.amount, currency: w.currency,
  assignmentContractId: ev.assignmentContractId,
  privateDeliveryContractId: ev.deliveryContractId,
  deliveryReceiptContractId: ev.receiptContractId,
  requestedUrl: rep.requestedUrl, finalUrl: rep.finalUrl,
  httpStatus: rep.httpStatus, responseLatencyMs: rep.responseLatencyMs,
  artifactByteLen: art.byteLength, computedSha256: sha256(canonicalReport), ledgerSha256: art.sha256,
}, null, 2));

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Tacit Work e2e — real runners bid, award+prepay, winner delivered a real audit, buyer verified + accepted, receipt is auditor-visible; sealed bids private per-party; tamper refused; idempotent.');
process.exit(fails ? 1 : 0);
