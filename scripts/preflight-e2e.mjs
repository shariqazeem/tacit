// Tacit — end-to-end privacy proof. Runs a full procurement through the live app
// and ASSERTS the ledger-enforced visibility invariants on the result, then
// prints a pasteable EVIDENCE block (mode, contract ids, party ids, timestamp).
//
// Every field's `visibleTo` in the response is derived by the app from real
// per-party Canton queries (read.ts) — so asserting on it IS asserting on
// ledger-enforced visibility, not app claims.
//
//   APP_URL=http://localhost:3000 node scripts/preflight-e2e.mjs
//   APP_URL=... node scripts/preflight-e2e.mjs --require-ledger   # fail (not warn) on fallback
//
// Exit 0 = all invariants hold (or fallback, unless --require-ledger).
// Exit 1 = app down, broken shape, or a privacy invariant VIOLATED.

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const REQUIRE_LEDGER = process.argv.includes('--require-ledger');
const PROVIDERS = ['providerA', 'providerB', 'providerC'];

let failed = 0;
const pass = (m) => console.log('  ✅ ' + m);
const bad = (m) => {
  console.error('  ❌ ' + m);
  failed++;
};
const vis = (field, persona) => Array.isArray(field?.visibleTo) && field.visibleTo.includes(persona);

async function getJson(path, opts = {}, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(APP_URL + path, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

console.log(`Tacit e2e privacy proof → ${APP_URL}\n`);

// 1) health → mode
const health = await getJson('/api/health', {}, 15000).catch(() => null);
if (!health?.json || health.json.app !== 'ok') {
  console.error(`❌ app unreachable / unhealthy at ${APP_URL}`);
  process.exit(1);
}
const mode = health.json.canton?.mode || 'unknown';
const pkg = health.json.packageId?.short;
console.log(`mode=${mode} · canton.reachable=${health.json.canton?.reachable} · pkg=${pkg}\n`);

// 2) run a real negotiation
const neg = await getJson('/api/negotiate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'e2e privacy proof', maxBudget: 60 }),
});
if (!neg.ok || !neg.json?.deal || !Array.isArray(neg.json.deal.bids)) {
  console.error(`❌ /api/negotiate broken (HTTP ${neg.status}): ${(neg.text || '').slice(0, 200)}`);
  process.exit(1);
}
const { deal, dealSource, ledger } = neg.json;

if (dealSource !== 'ledger') {
  const msg = `/api/negotiate returned FALLBACK (dealSource=${dealSource}) — no live ledger to prove privacy against.`;
  if (REQUIRE_LEDGER) {
    console.error('❌ ' + msg);
    process.exit(1);
  }
  console.warn('⚠️  ' + msg + ' Start a Canton participant for the full proof.');
  process.exit(0);
}

// 3) privacy invariants (all derived from real per-party ledger visibility)
const s = deal.settlement;
const winner = PROVIDERS.find((p) => vis(s.winner, p));
const losers = PROVIDERS.filter((p) => p !== winner);
console.log(`Ledger deal ${deal.id} · winner=${winner} · losers=${losers.join(',')}\n`);
console.log('Privacy invariants:');

// (a) settlement winner/amount: buyer + winner + auditor; NOT losers, NOT public
if (winner && vis(s.winner, 'buyer') && vis(s.winner, winner)) pass('settlement visible to buyer + winner');
else bad('settlement should be visible to buyer + winner');
if (!vis(s.winner, 'public')) pass('public cannot see the winner'); else bad('public must NOT see the winner');
for (const l of losers) if (!vis(s.winner, l)) pass(`losing ${l} cannot see the settlement`); else bad(`losing ${l} must NOT see the settlement`);

// (b) loser-blindness: each bid price visible only to {that provider, buyer}
for (const bid of deal.bids) {
  const p = bid.provider;
  if (vis(bid.amount, p) && vis(bid.amount, 'buyer')) pass(`${p}'s sealed price visible to itself + buyer`);
  else bad(`${p}'s sealed price must be visible to itself + buyer`);
  for (const other of PROVIDERS.filter((x) => x !== p))
    if (!vis(bid.amount, other)) {
      /* silent ok — asserted below in aggregate */
    } else bad(`${other} must NOT see ${p}'s sealed price`);
  if (!vis(bid.amount, 'public')) {} else bad(`public must NOT see ${p}'s sealed price`);
  if (!vis(bid.amount, 'auditor')) {} else bad(`auditor must NOT see ${p}'s sealed price`);
}
if (!failed) pass('no provider (or auditor, or public) can see a competitor’s sealed price');

// (c) the auditor crux — sees the settlement + paid amount, never a bid or the IOU
const pay = s.payment;
if (pay) {
  if (vis(s.amount, 'auditor')) pass('auditor CAN verify the settled amount (oversight)');
  else bad('auditor should see the settled amount');
  if (!vis(pay.iouContractId, 'auditor')) pass('auditor CANNOT see the payment IOU id (no surveillance)');
  else bad('auditor must NOT see the payment IOU id');
  if (vis(pay.iouContractId, 'buyer') && winner && vis(pay.iouContractId, winner))
    pass('payment IOU visible to buyer + winner only');
  else bad('payment IOU should be visible to buyer + winner');
  for (const l of losers)
    if (!vis(pay.iouContractId, l)) {} else bad(`losing ${l} must NOT see the payment IOU`);
} else {
  bad('ledger deal is missing payment data (expected on-ledger IOU transfer)');
}

// 4) evidence
console.log('\n=== EVIDENCE (on Canton) ===');
console.log(
  JSON.stringify(
    {
      mode,
      packageId: pkg,
      dealId: deal.id,
      settlementContractId: ledger?.contracts?.settlement || null,
      iouContractId: ledger?.contracts?.iou || null,
      parties: ledger?.parties || null,
      winner,
      settledAmount: s.amount?.value ?? null,
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

if (failed) {
  console.error(`\n❌ ${failed} privacy invariant(s) VIOLATED.`);
  process.exit(1);
}
console.log('\n✅ All privacy invariants hold — ledger-enforced visibility proven end to end.');
process.exit(0);
