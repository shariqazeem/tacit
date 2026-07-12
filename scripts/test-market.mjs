// Tacit — pure market-aggregation unit tests (node:assert, no framework).
// Imports the COMPILED shared module (runner/dist/_market.js) — the exact code the
// app imports via @/shared/market. Run: node scripts/test-market.mjs
// (after `cd runner && npm run build`). Covers normal history, empty ledger,
// missing-join degradation, winShare math, receipts ordering + cap, and the
// auditor-view discipline (no forbidden fields in the shaped output).
import assert from 'node:assert';
import { buildMarketOverview, shortCid, shortHash } from '../runner/dist/_market.js';

let pass = 0;
const ok = (m) => { console.log('  ✅ ' + m); pass++; };

const roster = [
  { id: 'providerA', label: 'Provider A', party: 'PartyA::abc', partyShort: 'PartyA::ab', servicesAdvertised: ['vendor_security_assessment', 'web_performance_probe'], ready: true },
  { id: 'providerB', label: 'Provider B', party: 'PartyB::abc', partyShort: 'PartyB::ab', servicesAdvertised: ['vendor_security_assessment', 'web_performance_probe'], ready: true },
  { id: 'providerC', label: 'Provider C', party: 'PartyC::abc', partyShort: 'PartyC::ab', servicesAdvertised: ['vendor_security_assessment', 'web_performance_probe'], ready: true },
];
const meta = { capableAgents: { ready: 3, total: 3 }, servicesLive: 2 };

// A normal, joinable history: 4 completed jobs across A(2) B(1) C(1), two services.
const settlements = [
  { contractId: 'S1cid000000aaaaaa', providerParty: 'PartyA::abc', amount: 20, serviceType: 'vendor_security_assessment', rfsId: 'WRK-j1' },
  { contractId: 'S2cid000000bbbbbb', providerParty: 'PartyB::abc', amount: 30, serviceType: 'web_performance_probe', rfsId: 'WRK-j2' },
  { contractId: 'S3cid000000cccccc', providerParty: 'PartyC::abc', amount: 15, serviceType: 'vendor_security_assessment', rfsId: 'WRK-j3' },
  { contractId: 'S4cid000000dddddd', providerParty: 'PartyA::abc', amount: 25, serviceType: 'web_performance_probe', rfsId: 'WRK-j4' },
];
const receipts = [
  { contractId: 'R1cid000000aaaaaa', providerParty: 'PartyA::abc', serviceType: 'vendor_security_assessment', sha256: 'a'.repeat(64), byteLen: 631, acceptedAtUtc: '2026-07-12T01:00:00.000Z', settlementCid: 'S1cid000000aaaaaa', rfsId: 'WRK-j1' },
  { contractId: 'R2cid000000bbbbbb', providerParty: 'PartyB::abc', serviceType: 'web_performance_probe', sha256: 'b'.repeat(64), byteLen: 900, acceptedAtUtc: '2026-07-12T02:00:00.000Z', settlementCid: 'S2cid000000bbbbbb', rfsId: 'WRK-j2' },
  { contractId: 'R3cid000000cccccc', providerParty: 'PartyC::abc', serviceType: 'vendor_security_assessment', sha256: 'c'.repeat(64), byteLen: 512, acceptedAtUtc: '2026-07-12T03:00:00.000Z', settlementCid: 'S3cid000000cccccc', rfsId: 'WRK-j3' },
  { contractId: 'R4cid000000dddddd', providerParty: 'PartyA::abc', serviceType: 'web_performance_probe', sha256: 'd'.repeat(64), byteLen: 742, acceptedAtUtc: '2026-07-12T04:00:00.000Z', settlementCid: 'S4cid000000dddddd', rfsId: 'WRK-j4' },
];

// ── normal history ───────────────────────────────────────────────────────────
{
  const o = buildMarketOverview(settlements, receipts, roster, meta);
  assert.equal(o.totals.completedJobs, 4, 'completedJobs');
  assert.equal(o.totals.totalVolume, 90, 'totalVolume = 20+30+15+25');
  ok('totals: 4 completed jobs, 90 demo credits volume');

  const A = o.providers.find((p) => p.id === 'providerA');
  const B = o.providers.find((p) => p.id === 'providerB');
  assert.equal(A.earned, 45, 'A earned 20+25');
  assert.equal(A.wins, 2, 'A won 2');
  assert.equal(A.winShare, 0.5, 'A winShare 2/4');
  assert.equal(B.earned, 30, 'B earned 30');
  assert.equal(B.winShare, 0.25, 'B winShare 1/4');
  ok('providers: earned = sum of own settlements; wins + winShare correct');

  const sumShare = o.providers.reduce((s, p) => s + p.winShare, 0);
  assert.ok(Math.abs(sumShare - 1) < 1e-9, 'winShares sum to 1');
  ok('winShares across providers sum to exactly 1');

  assert.deepEqual(o.totals.perService, {
    vendor_security_assessment: { jobs: 2, volume: 35 },
    web_performance_probe: { jobs: 2, volume: 55 },
  }, 'perService split');
  ok('per-service split derivable: {vendor: 2/35, perf: 2/55}');

  assert.equal(o.receipts.length, 4);
  assert.equal(o.receipts[0].acceptedAtUtc, '2026-07-12T04:00:00.000Z', 'newest first');
  assert.equal(o.receipts[3].acceptedAtUtc, '2026-07-12T01:00:00.000Z', 'oldest last');
  assert.equal(o.receipts[0].amount, 25, 'feed amount joined from settlement');
  assert.equal(o.receipts[0].winnerLabel, 'Provider A', 'winner label resolved');
  ok('receipts feed: reverse-chron, amount joined, winner labeled');

  assert.deepEqual(o.degradation, [], 'no degradation on a clean history');
  ok('no degradation notes on a fully joinable history');
}

// ── empty ledger ─────────────────────────────────────────────────────────────
{
  const o = buildMarketOverview([], [], roster, { capableAgents: { ready: 0, total: 3 }, servicesLive: 0 });
  assert.equal(o.totals.completedJobs, 0);
  assert.equal(o.totals.totalVolume, 0);
  assert.equal(o.totals.perService, null, 'perService null when empty');
  assert.equal(o.receipts.length, 0);
  assert.ok(o.providers.every((p) => p.earned === 0 && p.wins === 0 && p.winShare === 0), 'zeroed providers');
  ok('empty ledger: all zeros, perService null, no crash');
}

// ── missing-join degradation (a receipt with no matching settlement) ──────────
{
  const orphanReceipts = receipts.concat([
    { contractId: 'R5cid000000eeeeee', providerParty: 'PartyB::abc', serviceType: 'vendor_security_assessment', sha256: 'e'.repeat(64), byteLen: 400, acceptedAtUtc: '2026-07-12T05:00:00.000Z', settlementCid: null, rfsId: 'WRK-orphan' },
  ]);
  const o = buildMarketOverview(settlements, orphanReceipts, roster, meta);
  assert.equal(o.totals.completedJobs, 5, 'orphan still counts as a completed job');
  assert.equal(o.receipts[0].amount, null, 'orphan receipt amount is null, not fabricated');
  assert.ok(o.degradation.some((d) => /could not be joined/.test(d)), 'degradation note present');
  // job counted in per-service, but its volume is not added
  assert.equal(o.totals.perService.vendor_security_assessment.jobs, 3, 'orphan job counted');
  assert.equal(o.totals.perService.vendor_security_assessment.volume, 35, 'orphan volume NOT fabricated');
  ok('missing join: job counted, amount null, honest degradation note, volume not fabricated');
}

// ── receipts cap at 50, newest-first ─────────────────────────────────────────
{
  const many = Array.from({ length: 60 }, (_, i) => ({
    contractId: 'C' + String(i).padStart(4, '0') + '000000000000',
    providerParty: 'PartyA::abc', serviceType: 'vendor_security_assessment', sha256: 'f'.repeat(64), byteLen: 100 + i,
    acceptedAtUtc: `2026-07-12T${String(i % 24).padStart(2, '0')}:00:${String(i % 60).padStart(2, '0')}.000Z`,
    settlementCid: null, rfsId: 'WRK-m' + i,
  }));
  const o = buildMarketOverview([], many, roster, meta);
  assert.equal(o.receipts.length, 50, 'capped at 50');
  for (let i = 1; i < o.receipts.length; i++) assert.ok(o.receipts[i - 1].acceptedAtUtc >= o.receipts[i].acceptedAtUtc, 'monotonic reverse-chron');
  ok('receipts capped at 50, strictly reverse-chronological');
}

// ── auditor-view discipline: shaped output carries no forbidden fields ────────
{
  const o = buildMarketOverview(settlements, receipts, roster, meta);
  const blob = JSON.stringify(o).toLowerCase();
  assert.ok(!/https?:\/\//.test(blob), 'no http(s):// target strings in the output');
  assert.ok(!blob.includes('title'), 'no title field (could embed a target host)');
  assert.ok(!blob.includes('reportjson') && !blob.includes('"price"') && !blob.includes('bid'), 'no report body / raw price / bid');
  ok('shaped output contains no urls, titles, report bodies, prices, or bids');
}

// ── short helpers ────────────────────────────────────────────────────────────
{
  assert.equal(shortHash('a'.repeat(64)), 'aaaaaaaaaa…aaaa');
  assert.ok(shortCid('00' + 'a'.repeat(64)).includes('…'), 'realistic-length cid truncates');
  assert.equal(shortCid('short'), 'short', 'a short id is returned unchanged');
  ok('shortCid / shortHash truncate for display');
}

console.log(`\n✅ all ${pass} market aggregation tests passed`);
