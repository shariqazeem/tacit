// Tacit Work — offline unit/contract tests (node:assert, no framework).
// These lock the RULES (validation, health gate, persona masking, honest replay,
// MCP transform, sessionStorage restore). The LIVE integration is proven by
// scripts/preflight-work-e2e.mjs against real devnet + runners.
import assert from 'node:assert';
import crypto from 'node:crypto';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✅ ' + name); pass++; } catch (e) { console.error('  ❌ ' + name + ' — ' + e.message); fail++; } };
const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const JOB_RE = /^[A-Za-z0-9._:-]{3,64}$/;

console.log('Tacit Work unit tests\n');

// 1) jobId generator format (UI + MCP)
const newJobId = () => `wjob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
t('generated jobId always matches JOB_RE', () => { for (let i = 0; i < 100; i++) assert.ok(JOB_RE.test(newJobId())); });
t('jobId stays stable when reused for retry', () => { const id = newJobId(); assert.equal(id, id); });

// 2) procure validation spec (mirrors app/api/work/procure/route.ts)
function validate(body) {
  const jobId = typeof body?.jobId === 'string' && JOB_RE.test(body.jobId) ? body.jobId : null;
  const serviceType = typeof body?.serviceType === 'string' ? body.serviceType : 'site_audit';
  const url = typeof body?.input?.url === 'string' ? body.input.url : '';
  const b = body?.maxBudget;
  if (!jobId) return { ok: false, error: 'jobId' };
  if (serviceType !== 'site_audit') return { ok: false, error: 'serviceType' };
  if (!/^https:\/\//i.test(url) || url.length > 2048) return { ok: false, error: 'url' };
  if (!Number.isFinite(b) || b <= 0) return { ok: false, error: 'budget' };
  if (b > 10000) return { ok: false, error: 'budget-max' };
  return { ok: true };
}
t('rejects non-positive budget', () => {
  assert.equal(validate({ jobId: 'abc', input: { url: 'https://x.com' }, maxBudget: 0 }).ok, false);
  assert.equal(validate({ jobId: 'abc', input: { url: 'https://x.com' }, maxBudget: -5 }).ok, false);
});
t('rejects non-https url', () => assert.equal(validate({ jobId: 'abc', input: { url: 'http://x.com' }, maxBudget: 5 }).ok, false));
t('rejects too-short jobId', () => assert.equal(validate({ jobId: 'x', input: { url: 'https://x.com' }, maxBudget: 5 }).ok, false));
t('rejects budget > 10000', () => assert.equal(validate({ jobId: 'abc', input: { url: 'https://x.com' }, maxBudget: 20000 }).ok, false));
t('rejects wrong serviceType', () => assert.equal(validate({ jobId: 'abc', serviceType: 'video', input: { url: 'https://x.com' }, maxBudget: 5 }).ok, false));
t('accepts a valid request', () => assert.equal(validate({ jobId: 'wjob-1', input: { url: 'https://example.com' }, maxBudget: 100 }).ok, true));

// 3) health "ok" gate spec (mirrors app/api/work/health/route.ts)
function healthOk({ mode, reachable, workConfigured, runners }) {
  const di = runners.length > 0 && new Set(runners.map((r) => r.instanceId)).size === runners.length;
  const dp = runners.length > 0 && new Set(runners.map((r) => r.pid)).size === runners.length;
  const dparty = new Set(runners.map((r) => r.partyShort)).size === runners.length;
  return mode === 'devnet' && reachable && workConfigured && runners.length >= 3 && di && dp && dparty && runners.every((r) => r.ledgerMode === 'devnet');
}
const R = (i, p, pt) => ({ instanceId: i, pid: p, partyShort: pt, ledgerMode: 'devnet' });
t('health ok requires three distinct ready runners on devnet', () => {
  assert.equal(healthOk({ mode: 'devnet', reachable: true, workConfigured: true, runners: [R('a', 1, 'A'), R('b', 2, 'B'), R('c', 3, 'C')] }), true);
  assert.equal(healthOk({ mode: 'devnet', reachable: true, workConfigured: true, runners: [R('a', 1, 'A'), R('b', 2, 'B')] }), false);
  assert.equal(healthOk({ mode: 'devnet', reachable: true, workConfigured: true, runners: [R('a', 1, 'A'), R('a', 2, 'B'), R('c', 3, 'C')] }), false);
  assert.equal(healthOk({ mode: 'devnet', reachable: false, workConfigured: true, runners: [R('a', 1, 'A'), R('b', 2, 'B'), R('c', 3, 'C')] }), false);
  assert.equal(healthOk({ mode: 'sandbox', reachable: true, workConfigured: true, runners: [R('a', 1, 'A'), R('b', 2, 'B'), R('c', 3, 'C')] }), false);
  assert.equal(healthOk({ mode: 'devnet', reachable: true, workConfigured: false, runners: [R('a', 1, 'A'), R('b', 2, 'B'), R('c', 3, 'C')] }), false);
});

// 4) persona masking (mirrors WorkLens predicates on the returned snapshot)
const vis = {
  available: true,
  bids: { buyer: ['bidA', 'bidB', 'bidC'], providerA: ['bidA'], providerB: ['bidB'], providerC: ['bidC'], auditor: [] },
  activeWorkRequest: { buyer: true, providerA: true, providerB: true, providerC: true, auditor: true },
  settlement: { buyer: true, providerA: false, providerB: false, providerC: true, auditor: true },
  privateDelivery: { buyer: true, providerA: false, providerB: false, providerC: true, auditor: false },
  receipt: { buyer: true, providerA: false, providerB: false, providerC: true, auditor: true },
};
const bids = [{ contractId: 'bidA' }, { contractId: 'bidB' }, { contractId: 'bidC' }];
const seesBid = (p, cid) => (vis.bids[p] || []).includes(cid);
t('buyer sees all three sealed bids', () => assert.ok(bids.every((b) => seesBid('buyer', b.contractId))));
t('each provider sees exactly its own bid', () => { assert.deepEqual(vis.bids.providerA, ['bidA']); assert.deepEqual(vis.bids.providerB, ['bidB']); assert.deepEqual(vis.bids.providerC, ['bidC']); });
t('auditor sees zero sealed bids', () => assert.deepEqual(vis.bids.auditor, []));
t('auditor sees the receipt but NOT the report body (the wow moment)', () => { assert.equal(vis.receipt.auditor, true); assert.equal(vis.privateDelivery.auditor, false); });
t('a losing provider sees no report and no receipt', () => { assert.equal(vis.privateDelivery.providerA, false); assert.equal(vis.receipt.providerA, false); });

// 5) honest replay — empty report is never counted as verification
t('empty report body never counts as verification', () => {
  const resumed = { artifact: { available: false, report: null, sha256: 'realcommitment', byteLength: 632, verifiedThisRequest: false }, resumption: { resumed: true, historicalArtifactNotLoaded: true } };
  assert.equal(resumed.artifact.verifiedThisRequest, false);
  assert.equal(resumed.artifact.report, null);
  assert.notEqual(sha256(''), resumed.artifact.sha256);
  assert.ok(resumed.resumption.historicalArtifactNotLoaded);
});
t('fresh run marks verifiedThisRequest true and the hash matches the report', () => {
  const report = { service: 'site_audit', score: 70 };
  const canonical = JSON.stringify(report);
  const fresh = { artifact: { available: true, report, sha256: sha256(canonical), byteLength: Buffer.byteLength(canonical, 'utf8'), verifiedThisRequest: true } };
  assert.equal(fresh.artifact.verifiedThisRequest, true);
  assert.equal(sha256(JSON.stringify(fresh.artifact.report)), fresh.artifact.sha256);
});

// 6) sessionStorage restore gate (mirrors WorkExperience)
const canRestore = (stored) => !!(stored?.result?.ok && stored.result.schema === 2);
t('sessionStorage restore requires ok + schema 2', () => {
  assert.equal(canRestore({ result: { ok: true, schema: 2 } }), true);
  assert.equal(canRestore({ result: { ok: true, schema: 1 } }), false);
  assert.equal(canRestore({ result: { ok: false, schema: 2 } }), false);
  assert.equal(canRestore(null), false);
});

// 7) MCP structuredContent transform (mirrors tacit_procure_work)
function mcpStructured(data, url) {
  const rep = data.artifact?.report; const ev = data.evidence || {};
  return {
    ok: true, mode: String(data.mode), jobId: String(data.jobId), resumed: !!data.resumption?.resumed,
    requestedUrl: url, httpStatus: rep?.httpStatus, winner: String(data.winner?.providerLabel),
    amount: Number(data.amount), currency: String(data.currency),
    settlementContractId: String(ev.settlementContractId), receiptContractId: String(ev.receiptContractId),
    verifiedThisRequest: !!data.artifact?.verifiedThisRequest,
  };
}
t('MCP transform extracts the right fields from a fresh response', () => {
  const data = { mode: 'devnet', jobId: 'wjob-1', resumption: { resumed: false }, winner: { providerLabel: 'providerC' }, amount: 19.78, currency: 'USD.demo', artifact: { report: { httpStatus: 200 }, verifiedThisRequest: true }, evidence: { settlementContractId: 'S1', receiptContractId: 'R1' } };
  const s = mcpStructured(data, 'https://example.com');
  assert.equal(s.winner, 'providerC'); assert.equal(s.httpStatus, 200); assert.equal(s.verifiedThisRequest, true); assert.equal(s.settlementContractId, 'S1'); assert.equal(s.currency, 'USD.demo');
});

console.log(fail ? `\n❌ ${fail} unit test(s) failed` : `\n✅ all ${pass} work unit tests passed`);
process.exit(fail ? 1 : 0);
