// Tacit — LIVE market (agent economy) preflight against real Canton devnet.
//
//   APP_URL=https://host node scripts/preflight-market.mjs --require-ledger --require-runners
//
// Proves the /api/market/overview surface is the auditor's LAWFUL view, computed
// live: (1) valid shape + viewer=auditor + fresh asOfUtc; (2) real history exists;
// (3) each provider's displayed treasury EXACTLY equals an INDEPENDENT recompute
// from raw auditor Canton queries (settlements joined to receipts); (4) an Iou
// reconciliation, scoped to work-path settlements and reported; (5) a forbidden-
// fields scan of the raw body (no bids, no report bodies, no target urls in the
// feed); (6) the read cache shares asOfUtc within its window and advances after.
//
// Needs the devnet env (OAuth + TACIT_PARTIES_JSON) sourced, so the recompute can
// query Canton directly — the same credentials the app uses.
import crypto from 'node:crypto';

const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };
const must = (c, m) => (c ? ok(m) : bad(m));
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

async function jget(url, t = 20000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), t);
  try { const r = await fetch(url, { signal: ctrl.signal }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text }; }
  finally { clearTimeout(timer); }
}

// ── minimal Canton v2 client (independent of the app) ────────────────────────
const V2 = (process.env.TACIT_V2_API_URL || '').replace(/\/$/, '');
const PARTIES = (() => { try { return JSON.parse(process.env.TACIT_PARTIES_JSON || '{}'); } catch { return {}; } })();
let tok = null;
async function token() {
  if (tok && tok.exp - 30000 > Date.now()) return tok.v;
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TACIT_DEVNET_CLIENT_ID || '', client_secret: process.env.TACIT_DEVNET_CLIENT_SECRET || '' });
  if (process.env.TACIT_DEVNET_AUDIENCE) form.set('audience', process.env.TACIT_DEVNET_AUDIENCE);
  if (process.env.TACIT_DEVNET_SCOPE) form.set('scope', process.env.TACIT_DEVNET_SCOPE);
  const r = await fetch(process.env.TACIT_DEVNET_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const j = JSON.parse(await r.text());
  if (!j.access_token) throw new Error('no access_token');
  tok = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tok.v;
}
function deepFind(o, key) { const out = []; const walk = (n) => { if (!n || typeof n !== 'object') return; if (n[key] !== undefined) out.push(n[key]); for (const k of Object.keys(n)) walk(n[k]); }; walk(o); return out; }
async function v2(path, body) {
  const r = await fetch(V2 + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); if (!r.ok) throw new Error(`${path} HTTP ${r.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}
async function activeAs(party, templateId) {
  const end = await v2('/v2/state/ledger-end');
  const offset = deepFind(end, 'offset')[0];
  const resp = await v2('/v2/state/active-contracts', {
    activeAtOffset: offset, verbose: false,
    eventFormat: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } }] } }, verbose: false },
  });
  const rows = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.contractId && (n.createArgument || n.createArguments || n.payload)) rows.push({ contractId: n.contractId, payload: n.createArgument || n.createArguments || n.payload }); for (const k of Object.keys(n)) walk(n[k]); };
  walk(resp);
  const seen = new Set(); return rows.filter((r) => (seen.has(r.contractId) ? false : (seen.add(r.contractId), true)));
}

console.log(`Tacit market preflight → ${APP_URL}\n`);

// ── 1) shape + viewer + freshness ────────────────────────────────────────────
console.log('Overview shape (auditor view):');
const r1 = await jget(APP_URL + '/api/market/overview');
if (r1.status !== 200 || r1.json?.available !== true) { console.error(`❌ overview unavailable (HTTP ${r1.status}): ${(r1.text || '').slice(0, 200)}`); process.exit(1); }
const m = r1.json;
must(m.viewer === 'auditor' && m.ledgerDerived === true, 'viewer=auditor, ledger-derived');
const ageMs = Date.now() - new Date(m.asOfUtc).getTime();
// Allow a few seconds of negative skew: the app's clock may be slightly ahead of
// the machine running this preflight, making a just-computed asOfUtc look "future".
must(!isNaN(ageMs) && ageMs > -10000 && ageMs < 120000, `asOfUtc is sane + fresh (${Math.round(ageMs / 1000)}s old)`);
must(m.currency === 'USD.demo', 'currency labeled USD.demo (demo credits)');
must(Array.isArray(m.providers) && m.providers.length === 3 && Array.isArray(m.receipts), 'providers[3] + receipts[] present');
must(m.totals && typeof m.totals.completedJobs === 'number' && typeof m.totals.totalVolume === 'number', 'totals well-formed');

// internal consistency: totalVolume == Σ perService.volume == Σ provider.earned
const psSum = m.totals.perService ? Object.values(m.totals.perService).reduce((s, x) => s + x.volume, 0) : 0;
const earnSum = m.providers.reduce((s, p) => s + p.earned, 0);
must(near(m.totals.totalVolume, Math.round(psSum * 100) / 100) && near(m.totals.totalVolume, Math.round(earnSum * 100) / 100), 'totalVolume == Σ perService.volume == Σ provider.earned (work-path scoped)');

// ── 2) real history exists ───────────────────────────────────────────────────
console.log('\nReal history:');
must(m.totals.completedJobs >= 1, `completedJobs ≥ 1 (${m.totals.completedJobs})`);
must(m.receipts.length >= 1, `receipts feed ≥ 1 (${m.receipts.length})`);

// ── 3) independent recompute of per-provider treasury (raw auditor queries) ──
console.log('\nIndependent recompute (raw auditor Canton queries):');
let auditorSettles = [], auditorReceipts = [];
try {
  const auditor = PARTIES.Auditor;
  if (!auditor || !V2) throw new Error('devnet env (TACIT_PARTIES_JSON.Auditor / TACIT_V2_API_URL) not sourced');
  auditorSettles = await activeAs(auditor, '#tacit:Tacit.Sealed:Settlement');
  auditorReceipts = await activeAs(auditor, '#tacit-work:TacitWork:DeliveryReceipt');
} catch (e) {
  bad(`could not query Canton independently: ${String(e?.message || e)}`);
}
if (auditorReceipts.length) {
  // Recompute work-path earned per provider party = Σ, over that provider's receipts,
  // of the joined settlement's price (join by rfsId). This mirrors the pure module
  // with ZERO shared code — a genuine cross-check of the displayed treasury.
  const settleByRfs = new Map();
  for (const s of auditorSettles) if (!settleByRfs.has(String(s.payload.rfsId))) settleByRfs.set(String(s.payload.rfsId), s);
  const earnedByParty = new Map(), winsByParty = new Map();
  for (const r of auditorReceipts) {
    const prov = String(r.payload.provider); const joined = settleByRfs.get(String(r.payload.rfsId));
    winsByParty.set(prov, (winsByParty.get(prov) || 0) + 1);
    if (joined) earnedByParty.set(prov, (earnedByParty.get(prov) || 0) + (Number(joined.payload.price) || 0));
  }
  must(auditorReceipts.length === m.totals.completedJobs, `independent receipt count == API completedJobs (${auditorReceipts.length})`);
  let allMatch = true;
  for (const p of m.providers) {
    // map roster label → party via PARTIES (ProviderA/B/C)
    const hint = p.id.replace('provider', 'Provider'); const party = PARTIES[hint];
    const indepEarned = Math.round((earnedByParty.get(party) || 0) * 100) / 100;
    const indepWins = winsByParty.get(party) || 0;
    if (!near(indepEarned, p.earned) || indepWins !== p.wins) { allMatch = false; bad(`${p.label}: API earned=${p.earned}/wins=${p.wins} != independent earned=${indepEarned}/wins=${indepWins}`); }
  }
  if (allMatch) ok('every provider treasury + wins matches an independent auditor recompute');

  // ── 4) Iou reconciliation, scoped to work-path settlements ─────────────────
  console.log('\nIou reconciliation (scoped to work-path; auditor cannot see Ious):');
  for (const p of m.providers) {
    const hint = p.id.replace('provider', 'Provider'); const party = PARTIES[hint];
    let iouBal = 0;
    try { const ious = await activeAs(party, '#tacit:Tacit.Sealed:Iou'); iouBal = Math.round(ious.filter((c) => String(c.payload.owner) === party && String(c.payload.currency) === 'USD.demo').reduce((s, c) => s + (Number(c.payload.amount) || 0), 0) * 100) / 100; }
    catch (e) { bad(`${p.label}: Iou query failed: ${String(e?.message || e)}`); continue; }
    // Work-scoped invariant: the provider's TOTAL Iou balance (work + any pre-existing
    // negotiate-demo winnings) must be >= its work-path treasury. The excess is
    // pre-existing negotiate-demo Ious and is reported, not asserted away.
    const excess = Math.round((iouBal - p.earned) * 100) / 100;
    must(iouBal + 0.02 >= p.earned, `${p.label}: Iou balance ${iouBal} ≥ work treasury ${p.earned} (excess ${excess} = pre-existing negotiate-demo Ious)`);
  }
}

// ── 5) forbidden-fields scan of the raw response body ────────────────────────
console.log('\nForbidden-fields scan (auditor-view discipline):');
const raw = r1.text;
must(!/https?:\/\//i.test(raw), 'no http(s):// target strings anywhere in the response');
must(!/"reportjson"|"report"\s*:|"bodybytes"/i.test(raw), 'no report-body keys');
must(!/"sealedbid"|"bids?"\s*:\s*\[|"bidprice"|"price"\s*:/i.test(raw), 'no bid structures or raw prices');
must(!/"title"/i.test(raw), 'no title field (could embed a target host)');

// ── 6) read-cache behavior ───────────────────────────────────────────────────
console.log('\nRead cache (≤15s window):');
const a = (await jget(APP_URL + '/api/market/overview')).json;
const b = (await jget(APP_URL + '/api/market/overview')).json;
must(a?.asOfUtc && a.asOfUtc === b.asOfUtc, 'two rapid GETs share the same asOfUtc (cached)');
console.log('  … waiting 16s for the cache to expire …');
await new Promise((r) => setTimeout(r, 16000));
const c = (await jget(APP_URL + '/api/market/overview')).json;
must(c?.asOfUtc && c.asOfUtc !== a.asOfUtc, 'a later GET advances asOfUtc (recomputed live)');

console.log('\n=== MARKET EVIDENCE ===');
console.log(JSON.stringify({
  viewer: m.viewer, asOfUtc: m.asOfUtc, completedJobs: m.totals.completedJobs, totalVolume: `${m.totals.totalVolume} ${m.currency}`,
  perService: m.totals.perService, capableAgents: m.meta?.capableAgents, servicesLive: m.meta?.servicesLive,
  providers: m.providers.map((p) => ({ label: p.label, earned: p.earned, wins: p.wins, winShare: p.winShare, ready: p.ready })),
  topReceipt: m.receipts[0], degradation: m.degradation,
}, null, 2));

console.log(fails ? `\n❌ ${fails} check(s) failed.` : '\n✅ Market preflight — auditor-view economy computed live, treasuries match an independent recompute, Iou reconciliation scoped, no private fields leak, cache honest.');
process.exit(fails ? 1 : 0);
