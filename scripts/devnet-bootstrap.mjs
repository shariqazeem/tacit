#!/usr/bin/env node
// Tacit — bootstrap a Canton 3.x participant for Tacit (LocalNet OR devnet).
//
// Idempotent. Same script for canton3-local and devnet — only env differs:
//   • upload the v2 templates DAR (skip if already present)
//   • allocate/reuse the demo parties by hint, printing full party ids
//   • print a machine-readable summary block to paste into env/docs
//
// Talks the Canton 3.x v2 JSON Ledger API — the same endpoints the app's
// cantonV2 adapter uses, so if this works the app will too.
//
// Usage:
//   TACIT_V2_API_URL=http://localhost:3975 TACIT_V2_AUTH=none \
//     node scripts/devnet-bootstrap.mjs --dar daml3/.daml/dist/tacit-0.1.0.dar
//
// Env:
//   TACIT_V2_API_URL   (required)  participant JSON Ledger API base URL
//   TACIT_V2_AUTH      none|static|oauth  (default none)
//   TACIT_V2_STATIC_TOKEN                 (auth=static)
//   TACIT_DEVNET_TOKEN_URL / _CLIENT_ID / _CLIENT_SECRET / _AUDIENCE / _SCOPE  (auth=oauth)
//   TACIT_PACKAGE_ID_V2  (default fdfbfcf0… — the frozen v2 templates package)

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const API = (process.env.TACIT_V2_API_URL || '').replace(/\/$/, '');
const AUTH = (process.env.TACIT_V2_AUTH || 'none').toLowerCase();
const PKG =
  process.env.TACIT_PACKAGE_ID_V2 || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
const darArg = process.argv.indexOf('--dar');
const DAR = darArg > -1 ? process.argv[darArg + 1] : 'daml3/.daml/dist/tacit-0.1.0.dar';

// The exact party set the app uses (write.ts): buyer + 3 providers + auditor.
const PARTY_HINTS = ['Buyer', 'ProviderA', 'ProviderB', 'ProviderC', 'Auditor'];
// On a SHARED validator (devnet) the m2m client may be common to many teams, so
// allocate with a unique prefix to avoid party-name collisions. The logical hint
// (Buyer, ProviderA, …) is what the app pins; the prefix only affects allocation.
const PREFIX = process.env.TACIT_PARTY_PREFIX || 'Tacit' + Math.floor(Math.random() * 1e6).toString(36);

if (!API) {
  console.error('❌ TACIT_V2_API_URL is required (e.g. http://localhost:3975)');
  process.exit(1);
}

// ── OAuth2 client-credentials (auth=oauth), cached ───────────────────────────
let cachedToken = null;
async function token() {
  if (AUTH === 'none') return null;
  if (AUTH === 'static') return process.env.TACIT_V2_STATIC_TOKEN || '';
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.v;
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.TACIT_DEVNET_CLIENT_ID || '',
    client_secret: process.env.TACIT_DEVNET_CLIENT_SECRET || '',
  });
  if (process.env.TACIT_DEVNET_AUDIENCE) form.set('audience', process.env.TACIT_DEVNET_AUDIENCE);
  if (process.env.TACIT_DEVNET_SCOPE) form.set('scope', process.env.TACIT_DEVNET_SCOPE);
  const r = await fetch(process.env.TACIT_DEVNET_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!r.ok) throw new Error(`OAuth token request failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  cachedToken = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cachedToken.v;
}

async function api(pathname, { method = 'GET', json, octet } = {}) {
  const t = await token();
  const headers = t ? { Authorization: `Bearer ${t}` } : {};
  let body;
  if (octet) {
    headers['Content-Type'] = 'application/octet-stream';
    body = octet;
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const r = await fetch(API + pathname, { method, headers, body });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = text;
  }
  return { status: r.status, json: j, text };
}

const ok = (r) => r.status >= 200 && r.status < 300;

// Collect every value stored under `key` anywhere in a JSON tree.
function deep(node, key, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const x of node) deep(x, key, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      deep(v, key, out);
    }
  }
  return out;
}

async function main() {
  console.log(`Tacit bootstrap → ${API}   (auth=${AUTH}, pkg=${PKG.slice(0, 8)}…)\n`);

  // 1) reachability
  const end = await api('/v2/state/ledger-end');
  if (!ok(end)) {
    console.error(`❌ participant not reachable — /v2/state/ledger-end HTTP ${end.status}: ${end.text.slice(0, 200)}`);
    console.error('   → is the participant up and is TACIT_V2_API_URL correct? (auth may be required)');
    process.exit(1);
  }
  const offset = deep(end.json, 'offset')[0] ?? 0;
  console.log(`✅ participant reachable · ledger offset ${offset}`);

  // 2) upload the DAR (idempotent — skip if the package id is already known)
  const pkgs = await api('/v2/packages');
  const alreadyUploaded = ok(pkgs) && (pkgs.text || '').includes(PKG);
  if (alreadyUploaded) {
    console.log(`✅ DAR already present (${PKG.slice(0, 8)}…)`);
  } else {
    const abs = path.resolve(DAR);
    let bytes;
    try {
      bytes = await readFile(abs);
    } catch {
      console.error(`❌ DAR not found at ${abs} — build it first (npm run daml:build:v2) or pass --dar <path>`);
      process.exit(1);
    }
    const up = await api('/v2/packages', { method: 'POST', octet: bytes });
    if (!ok(up)) {
      console.error(`❌ DAR upload failed — HTTP ${up.status}: ${up.text.slice(0, 300)}`);
      process.exit(1);
    }
    console.log(`✅ uploaded DAR ${DAR} (${bytes.length} bytes)`);
  }

  // 3) allocate / reuse parties
  const list = await api('/v2/parties');
  const existing = deep(list.json, 'party').filter((p) => typeof p === 'string');
  const parties = {};
  for (const hint of PARTY_HINTS) {
    const allocHint = PREFIX + hint;
    let full = existing.find((p) => p.split('::')[0] === allocHint);
    if (full) {
      console.log(`✅ reused    ${hint.padEnd(9)} → ${full}`);
    } else {
      const a = await api('/v2/parties', { method: 'POST', json: { partyIdHint: allocHint, identityProviderId: '' } });
      if (!ok(a)) {
        console.error(`❌ allocate ${hint} failed — HTTP ${a.status}: ${a.text.slice(0, 200)}`);
        process.exit(1);
      }
      full = deep(a.json, 'party').filter((p) => typeof p === 'string')[0];
      if (!full) {
        console.error(`❌ allocate ${hint}: no party id in response — ${a.text.slice(0, 200)}`);
        process.exit(1);
      }
      console.log(`✅ allocated ${hint.padEnd(9)} → ${full}`);
    }
    parties[hint] = full;
  }

  // 3b) grant the operating ledger-api user CanActAs on each demo party.
  // v2 is user-based auth: the app submits as TACIT_V2_USER_ID, whose token
  // authenticates it — but it can only act as parties it's been granted.
  const USER = process.env.TACIT_V2_USER_ID || '';
  if (USER) {
    for (const hint of PARTY_HINTS) {
      const g = await api(`/v2/users/${encodeURIComponent(USER)}/rights`, {
        method: 'POST',
        json: {
          userId: USER,
          identityProviderId: '',
          rights: [{ kind: { CanActAs: { value: { party: parties[hint] } } } }],
        },
      });
      if (ok(g)) console.log(`✅ granted ${USER} CanActAs ${hint}`);
      else console.log(`⚠️  grant ${hint} → HTTP ${g.status} (may already hold it)`);
    }
  } else {
    console.log('ℹ️  TACIT_V2_USER_ID not set — skipping rights grant (auth=none, or user pre-authorized)');
  }

  // 4) machine-readable summary
  const summary = { ok: true, apiUrl: API, auth: AUTH, packageId: PKG, ledgerOffset: offset, parties };
  console.log('\n=== BOOTSTRAP SUMMARY (paste into env/docs) ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n# Pin these parties on the app (they are stable; the shared validator won\'t list them):');
  console.log('TACIT_PARTIES_JSON=' + JSON.stringify(parties));
  console.log('\nNext: run the app with');
  console.log(`  TACIT_LEDGER_MODE=devnet TACIT_V2_API_URL=${API} TACIT_V2_AUTH=${AUTH} TACIT_PACKAGE_ID_V2=${PKG} npm start`);
}

main().catch((e) => {
  console.error('❌ bootstrap error:', e?.message || e);
  process.exit(1);
});
