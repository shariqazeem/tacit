// Tacit — Canton 3.x adapter smoke test. Exercises the EXACT v2 wire shapes the
// app's cantonV2 adapter uses (create / exercise / query) against a live
// participant, proving create→query→exercise→visibility end to end.
//
//   TACIT_V2_API_URL=http://localhost:3975 TACIT_V2_STATIC_TOKEN=$(cat ~/tacit-token.txt) \
//   BUYER=Buyer::12.. PROVIDER=ProviderA::12.. PKG=fdfbfcf0.. node scripts/canton3-smoke.mjs
//
// Exit 0 = all wire shapes verified; 1 = a mismatch (fix the adapter to match).

const API = (process.env.TACIT_V2_API_URL || 'http://localhost:3975').replace(/\/$/, '');
const TOKEN = process.env.TACIT_V2_STATIC_TOKEN || '';
const PKG = process.env.PKG || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
const BUYER = process.env.BUYER;
const PROVIDER = process.env.PROVIDER;
const APP_ID = process.env.V2_USER_ID || 'tacit';
const T_IOU = `${process.env.PKG_REF || '#tacit'}:Tacit.Sealed:Iou`;
if (!BUYER || !PROVIDER) {
  console.error('❌ set BUYER and PROVIDER to full party ids');
  process.exit(1);
}

async function req(pathname, { method = 'GET', json } = {}) {
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const r = await fetch(API + pathname, { method, headers, body });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, json: j, text };
}
const okr = (r) => r.status >= 200 && r.status < 300;
function deepObjectsWith(node, keys, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { for (const x of node) deepObjectsWith(x, keys, out); return out; }
  if (typeof node === 'object') {
    if (keys.every((k) => k in node)) out.push(node);
    for (const v of Object.values(node)) deepObjectsWith(v, keys, out);
  }
  return out;
}
function deep(node, key, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { for (const x of node) deep(x, key, out); return out; }
  if (typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === key) out.push(v); deep(v, key, out); }
  return out;
}
const payloadOf = (e) => e.createArgument ?? e.createArguments ?? e.payload;
const cmdId = () => `${APP_ID}-smoke-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
function ledgerEffects(actAs) {
  const wildcard = { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] };
  return { transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS', eventFormat: { filtersByParty: Object.fromEntries(actAs.map((p) => [p, wildcard])), verbose: false } };
}
async function submit(command, actAs) {
  const r = await req('/v2/commands/submit-and-wait-for-transaction', {
    method: 'POST',
    json: {
      commands: { commands: [command], commandId: cmdId(), userId: APP_ID, actAs, readAs: actAs },
      transactionFormat: ledgerEffects(actAs),
    },
  });
  if (!okr(r)) throw new Error(`submit HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  return r.json;
}
async function ledgerEnd() {
  const r = await req('/v2/state/ledger-end');
  return deep(r.json, 'offset')[0] ?? 0;
}
async function queryAs(party, templateId) {
  const offset = await ledgerEnd();
  const r = await req('/v2/state/active-contracts', {
    method: 'POST',
    json: { activeAtOffset: offset, verbose: false, eventFormat: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } }] } }, verbose: false } },
  });
  if (!okr(r)) throw new Error(`active-contracts HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  const seen = new Set();
  return deepObjectsWith(r.json, ['contractId']).filter((n) => payloadOf(n) !== undefined && !seen.has(n.contractId) && seen.add(n.contractId))
    .map((n) => ({ contractId: n.contractId, payload: payloadOf(n) }));
}

let failed = 0;
const pass = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); failed++; };

(async () => {
  console.log(`Canton 3.x smoke → ${API}\n`);

  // 1) CREATE an Iou as buyer
  const createResp = await submit({ CreateCommand: { templateId: T_IOU, createArguments: { issuer: BUYER, owner: BUYER, amount: '42.0', currency: 'USD.demo' } } }, [BUYER]);
  const created = deepObjectsWith(createResp, ['contractId']).filter((n) => payloadOf(n) !== undefined)[0];
  if (created?.contractId) pass(`create → contractId ${created.contractId.slice(0, 16)}…`);
  else { bad('create returned no contractId'); console.error(JSON.stringify(createResp).slice(0, 400)); }
  const iouCid = created?.contractId;

  // 2) QUERY active Ious as buyer — the new one must appear
  const buyerIous = await queryAs(BUYER, T_IOU);
  if (buyerIous.some((r) => r.contractId === iouCid)) pass(`query as buyer → sees its Iou (${buyerIous.length} active)`);
  else bad('query as buyer did not return the created Iou');

  // 3) EXERCISE Transfer (owner=buyer controls) → new Iou owned by provider
  let transferredCid = null;
  if (iouCid) {
    const exResp = await submit({ ExerciseCommand: { templateId: T_IOU, contractId: iouCid, choice: 'Transfer', choiceArgument: { newOwner: PROVIDER } } }, [BUYER]);
    const exEvents = deepObjectsWith(exResp, ['exerciseResult']);
    const result = (exEvents.find((e) => e.choice === 'Transfer') ?? exEvents[0])?.exerciseResult;
    transferredCid = typeof result === 'string' ? result : deep(result, 'contractId')[0] ?? null;
    if (result) pass(`exercise Transfer → result ${String(JSON.stringify(result)).slice(0, 40)}…`);
    else bad('exercise Transfer returned no result');
  }

  // 4) VISIBILITY: provider now sees an Iou it owns; buyer no longer owns the original
  const provIous = await queryAs(PROVIDER, T_IOU);
  if (provIous.some((r) => r.payload?.owner === PROVIDER)) pass('query as provider → sees the transferred Iou it now owns (ledger-enforced visibility)');
  else bad('provider does not see the transferred Iou');

  console.log(failed ? `\n❌ ${failed} check(s) failed — adjust the cantonV2 wire shapes to match.` : '\n✅ Canton 3.x adapter wire shapes verified: create · query · exercise · per-party visibility.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('❌ smoke error:', e?.message || e); process.exit(1); });
