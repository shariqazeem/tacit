#!/usr/bin/env node
// Tacit — bootstrap the STANDING SPEND MANDATE package (tacit-mandate) on a Canton
// participant (LocalNet OR devnet). Additive + idempotent; touches NOTHING the core
// tacit / tacit-work packages own.
//
// It:
//   1) uploads the tacit-mandate DAR (skip if the package id is already present)
//   2) allocates/reuses the principal party (TacitPrincipal), granting the ledger user CanActAs
//   3) creates an initial SpendMandate (principal signs, agent observes) IF none exists yet
//      for that (principal, agent) pair — default limit 500, unrestricted scope, no expiry
//   4) prints the package id + principal party + mandate contract id + env block
//
// The agent MUST be the same party the app resolves as its buyer (pinned 'Buyer'). Pass it
// via --agent <fullPartyId>, or env TACIT_BUYER_PARTY, or TACIT_PARTIES_JSON (the map the
// main bootstrap prints). Privacy: the auditor is NOT a stakeholder — it is never added.
//
// Usage:
//   TACIT_V2_API_URL=… TACIT_V2_AUTH=oauth TACIT_V2_USER_ID=… \
//   TACIT_BUYER_PARTY='Buyer::…' \
//     node scripts/devnet-bootstrap-mandate.mjs --dar tacit-mandate/.daml/dist/tacit-mandate-0.1.0.dar
//
// Env: same auth envs as devnet-bootstrap.mjs (TACIT_V2_AUTH none|static|oauth, …).
//   TACIT_MANDATE_LIMIT   (default 500)   initial limit + remaining
//   TACIT_MANDATE_CURRENCY(default USD.demo)
//   TACIT_MANDATE_SERVICES(default '' = unrestricted; comma-separated service ids to scope)
//   TACIT_MANDATE_LABEL   (default 'Standing procurement budget')

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const API = (process.env.TACIT_V2_API_URL || '').replace(/\/$/, '');
const AUTH = (process.env.TACIT_V2_AUTH || 'none').toLowerCase();
const USER = process.env.TACIT_V2_USER_ID || '';
const MANDATE_PKG_NAME = process.env.TACIT_MANDATE_PACKAGE_NAME || 'tacit-mandate';
const MANDATE_PKG_ID = process.env.TACIT_MANDATE_PACKAGE_ID || 'f3e2d2a95c64607323929d867b33a365c69c229298aad19e0ef6f537d1154d1a';
const darArg = process.argv.indexOf('--dar');
const DAR = darArg > -1 ? process.argv[darArg + 1] : 'tacit-mandate/.daml/dist/tacit-mandate-0.1.0.dar';
const agentArg = process.argv.indexOf('--agent');

const T_MANDATE = `#${MANDATE_PKG_NAME}:Tacit.Mandate:SpendMandate`;
const LIMIT = String(Number(process.env.TACIT_MANDATE_LIMIT || 500).toFixed(2));
const CURRENCY = process.env.TACIT_MANDATE_CURRENCY || 'USD.demo';
const SERVICES = (process.env.TACIT_MANDATE_SERVICES || '').split(',').map((s) => s.trim()).filter(Boolean);
const LABEL = process.env.TACIT_MANDATE_LABEL || 'Standing procurement budget';

function resolveAgent() {
  if (agentArg > -1 && process.argv[agentArg + 1]) return process.argv[agentArg + 1];
  if (process.env.TACIT_BUYER_PARTY) return process.env.TACIT_BUYER_PARTY;
  try {
    const m = JSON.parse(process.env.TACIT_PARTIES_JSON || '{}');
    if (m.Buyer) return m.Buyer;
  } catch { /* ignore */ }
  return '';
}
const AGENT = resolveAgent();

if (!API) { console.error('❌ TACIT_V2_API_URL is required'); process.exit(1); }
if (!AGENT) { console.error('❌ agent party required — pass --agent <fullPartyId>, or set TACIT_BUYER_PARTY / TACIT_PARTIES_JSON'); process.exit(1); }

// ── OAuth2 client-credentials (auth=oauth), cached ───────────────────────────
let cachedToken = null;
async function token() {
  if (AUTH === 'none') return null;
  if (AUTH === 'static') return process.env.TACIT_V2_STATIC_TOKEN || '';
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.v;
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TACIT_DEVNET_CLIENT_ID || '', client_secret: process.env.TACIT_DEVNET_CLIENT_SECRET || '' });
  if (process.env.TACIT_DEVNET_AUDIENCE) form.set('audience', process.env.TACIT_DEVNET_AUDIENCE);
  if (process.env.TACIT_DEVNET_SCOPE) form.set('scope', process.env.TACIT_DEVNET_SCOPE);
  const r = await fetch(process.env.TACIT_DEVNET_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!r.ok) throw new Error(`OAuth token request failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  cachedToken = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cachedToken.v;
}

async function api(pathname, { method = 'GET', json, octet } = {}) {
  const t = await token();
  const headers = t ? { Authorization: `Bearer ${t}` } : {};
  let body;
  if (octet) { headers['Content-Type'] = 'application/octet-stream'; body = octet; }
  else if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const r = await fetch(API + pathname, { method, headers, body });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, json: j, text };
}
const ok = (r) => r.status >= 200 && r.status < 300;

function deep(node, key, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { for (const x of node) deep(x, key, out); return out; }
  if (typeof node === 'object') { for (const [k, v] of Object.entries(node)) { if (k === key) out.push(v); deep(v, key, out); } }
  return out;
}
const cmdId = () => `mandate-boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const wildcard = { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] };
function ledgerEffectsFormat(actAs) {
  return { transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS', eventFormat: { filtersByParty: Object.fromEntries(actAs.map((p) => [p, wildcard])), verbose: false } };
}
async function submit(command, actAs) {
  const body = { commands: { commands: [command], commandId: cmdId(), userId: USER, actAs, readAs: actAs }, transactionFormat: ledgerEffectsFormat(actAs) };
  const r = await api('/v2/commands/submit-and-wait-for-transaction', { method: 'POST', json: body });
  if (!ok(r)) throw new Error(`submit failed: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}
async function ledgerEnd() { const r = await api('/v2/state/ledger-end'); return deep(r.json, 'offset')[0] ?? 0; }
async function queryAs(party, templateId) {
  const offset = await ledgerEnd();
  const body = { activeAtOffset: Number(offset), verbose: false, eventFormat: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } }] } }, verbose: false } };
  const r = await api('/v2/state/active-contracts', { method: 'POST', json: body });
  if (!ok(r)) throw new Error(`active-contracts failed: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  const rows = [];
  const created = deep(r.json, 'CreatedTreeEvent').concat(deep(r.json, 'created'));
  // Robust: collect any node carrying a contractId + createArgument(s).
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'object') {
      if (n.contractId && (n.createArgument || n.createArguments)) rows.push({ contractId: n.contractId, payload: n.createArgument || n.createArguments });
      for (const v of Object.values(n)) walk(v);
    }
  })(r.json);
  void created;
  return rows;
}

async function main() {
  console.log(`Tacit mandate bootstrap → ${API}   (auth=${AUTH}, pkg=${MANDATE_PKG_ID.slice(0, 8)}…)\n`);

  // 1) reachability
  const end = await api('/v2/state/ledger-end');
  if (!ok(end)) { console.error(`❌ participant not reachable — /v2/state/ledger-end HTTP ${end.status}: ${end.text.slice(0, 200)}`); process.exit(1); }
  console.log(`✅ participant reachable · ledger offset ${deep(end.json, 'offset')[0] ?? 0}`);

  // 2) upload the mandate DAR (idempotent — skip if already present)
  const pkgs = await api('/v2/packages');
  if (ok(pkgs) && (pkgs.text || '').includes(MANDATE_PKG_ID)) {
    console.log(`✅ tacit-mandate DAR already present (${MANDATE_PKG_ID.slice(0, 8)}…)`);
  } else {
    const abs = path.resolve(DAR);
    let bytes;
    try { bytes = await readFile(abs); } catch { console.error(`❌ DAR not found at ${abs} — build it first (npm run daml:build:mandate) or pass --dar <path>`); process.exit(1); }
    const up = await api('/v2/packages', { method: 'POST', octet: bytes });
    if (!ok(up)) {
      console.error(`❌ tacit-mandate DAR upload failed — HTTP ${up.status}: ${up.text.slice(0, 300)}`);
      console.error('   → if the shared validator refuses DAR upload, ABORT the ledger half: keep TACIT_MANDATE_MODE=off. The rest of the product is untouched.');
      process.exit(1);
    }
    console.log(`✅ uploaded tacit-mandate DAR ${DAR} (${bytes.length} bytes)`);
  }

  // 3) allocate / reuse the principal party
  const PRINCIPAL_HINT = process.env.TACIT_PRINCIPAL_HINT || ('TacitPrincipal' + (process.env.TACIT_PARTY_PREFIX || ''));
  const list = await api('/v2/parties');
  const existing = deep(list.json, 'party').filter((p) => typeof p === 'string');
  let principal = existing.find((p) => p.split('::')[0] === PRINCIPAL_HINT);
  if (principal) {
    console.log(`✅ reused principal ${principal}`);
  } else {
    const a = await api('/v2/parties', { method: 'POST', json: { partyIdHint: PRINCIPAL_HINT, identityProviderId: '' } });
    if (!ok(a)) { console.error(`❌ allocate principal failed — HTTP ${a.status}: ${a.text.slice(0, 200)}`); process.exit(1); }
    principal = deep(a.json, 'party').filter((p) => typeof p === 'string')[0];
    console.log(`✅ allocated principal ${principal}`);
  }
  // grant the ledger user CanActAs the principal (so the app/scripts can submit as it)
  if (USER) {
    const g = await api(`/v2/users/${encodeURIComponent(USER)}/rights`, { method: 'POST', json: { userId: USER, identityProviderId: '', rights: [{ kind: { CanActAs: { value: { party: principal } } } }] } });
    console.log(ok(g) ? `✅ granted ${USER} CanActAs principal` : `⚠️  grant principal → HTTP ${g.status} (may already hold it)`);
  }

  // 4) create the initial SpendMandate IF none exists for this (principal, agent)
  const existingMandates = (await queryAs(principal, T_MANDATE)).filter((m) => String(m.payload?.principal) === principal && String(m.payload?.agent) === AGENT);
  let mandateCid;
  if (existingMandates.length) {
    mandateCid = existingMandates[0].contractId;
    console.log(`✅ mandate already exists → ${mandateCid} (remaining ${existingMandates[0].payload?.remaining} of ${existingMandates[0].payload?.limit})`);
  } else {
    const payload = { principal, agent: AGENT, label: LABEL, currency: CURRENCY, limit: LIMIT, remaining: LIMIT, allowedServices: SERVICES, expiresAtUtc: null };
    const resp = await submit({ CreateCommand: { templateId: T_MANDATE, createArguments: payload } }, [principal]);
    mandateCid = deep(resp, 'contractId')[0];
    if (!mandateCid) { console.error('❌ create SpendMandate: no contractId in response ' + JSON.stringify(resp).slice(0, 300)); process.exit(1); }
    console.log(`✅ created SpendMandate → ${mandateCid}  (limit ${LIMIT} ${CURRENCY}, scope ${SERVICES.length ? SERVICES.join('/') : 'unrestricted'})`);
  }

  // 5) machine-readable summary
  const summary = { ok: true, apiUrl: API, mandatePackageId: MANDATE_PKG_ID, mandatePackageName: MANDATE_PKG_NAME, principal, agent: AGENT, mandateCid, limit: LIMIT, currency: CURRENCY, allowedServices: SERVICES };
  console.log('\n=== MANDATE BOOTSTRAP SUMMARY (paste into env/docs) ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n# Turn the feature ON (the whole product stays identical when off):');
  console.log('TACIT_MANDATE_MODE=on');
  console.log(`TACIT_MANDATE_PACKAGE_NAME=${MANDATE_PKG_NAME}`);
  console.log(`TACIT_MANDATE_PACKAGE_ID=${MANDATE_PKG_ID}`);
  console.log(`TACIT_PRINCIPAL_PARTY=${principal}`);
  console.log('\nNext: verify live with  npm run preflight:mandate');
}

main().catch((e) => { console.error('❌ mandate bootstrap error:', e?.message || e); process.exit(1); });
