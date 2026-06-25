// Tacit preflight — run before recording a demo or deploying.
//
//   npm run preflight                              # defaults to http://localhost:3000
//   APP_URL=http://localhost:3100 npm run preflight
//
// Exit codes:
//   0  app reachable + response shapes OK (whether ledger-backed OR fallback)
//   1  app unreachable, or a response shape is broken
// Ledger unreachable + fallback used  => WARN (still exit 0).

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

async function getJson(path, opts = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(APP_URL + path, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

const ok = (m) => console.log('✅ ' + m);
const warn = (m) => console.warn('⚠️  ' + m);
const fail = (m) => { console.error('❌ ' + m); process.exit(1); };

console.log(`Tacit preflight → ${APP_URL}\n`);

// 1) /api/health
let health;
try {
  health = await getJson('/api/health', {}, 15000);
} catch (e) {
  fail(`app unreachable at ${APP_URL} (/api/health): ${e?.message || e}`);
}
// The app responding with app:'ok' is what matters here. A 503 from the
// container memory check (heap > 90%) is a degraded signal, not "app down" —
// warn, don't fail.
if (!health.json || health.json.app !== 'ok') {
  fail(`/api/health bad response (HTTP ${health.status}): ${(health.text || '').slice(0, 200)}`);
}
if (health.json.status === 'degraded') {
  warn(`app memory degraded (${health.json.memory?.usagePercent}% heap) — ok for a smoke test, watch it on the VM`);
}
const c = health.json.canton;
const pkg = health.json.packageId;
ok(`/api/health → app ok · canton.reachable=${c.reachable} · ledger=${c.ledgerUrl} · pkg=${pkg.short}${pkg.fromEnv ? '' : ' (default)'}`);
if (!c.reachable) warn(`Canton JSON API not reachable: ${c.error}`);
if (pkg.warning) warn(pkg.warning);

// 2) /api/negotiate (can be slow on a cold compile — generous timeout)
let neg;
try {
  neg = await getJson('/api/negotiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 150000);
} catch (e) {
  fail(`/api/negotiate unreachable: ${e?.message || e}`);
}
if (!neg.ok || !neg.json || !neg.json.deal || !Array.isArray(neg.json.deal.bids) || !neg.json.dealSource) {
  fail(`/api/negotiate broken response shape (HTTP ${neg.status}): ${(neg.text || '').slice(0, 200)}`);
}

if (neg.json.dealSource === 'ledger') {
  const cid = neg.json.ledger?.contracts?.settlement || '(none)';
  ok(`/api/negotiate → LEDGER-backed · settlement contract ${String(cid).slice(0, 12)}…`);
} else {
  warn(`/api/negotiate → FALLBACK (deterministic in-memory). dealSource=${neg.json.dealSource}. Start the Canton ledger for the live privacy proof.`);
}

console.log('\n✅ Preflight complete — app is up and responding.');
process.exit(0);
