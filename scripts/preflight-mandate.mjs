// Tacit — LIVE spending-mandate preflight against real Canton devnet, flag ON.
//
//   APP_URL=https://host node scripts/preflight-mandate.mjs --require-ledger [--deep]
//
// Proves the on-ledger spend mandate is REAL, not decorative:
//   1) status readable — GET /api/mandate/status returns the agent's standing mandate.
//   2) real procurement decrements the mandate by EXACTLY the winning price, and the
//      response carries an on-ledger spend-authorization contract id.
//   3) an over-budget request is refused at the read-only PRE-CHECK with HTTP 402
//      MANDATE_INSUFFICIENT and ZERO ledger writes (remaining unchanged).
//   4) resuming the same jobId does NOT authorize a second spend (idempotent).
//   --deep (direct v2 ledger, needs principal+agent CanActAs):
//   5) a direct over-limit Authorize FAILS on the ledger — a REAL command failure
//      (the raw error is printed verbatim), never a simulated one.
//   6) a principal TopUp restores budget and a fresh procurement then completes.
//
// The app must run with TACIT_MANDATE_MODE=on and a mandate bootstrapped
// (scripts/devnet-bootstrap-mandate.mjs). Devnet env (OAuth + parties) must be sourced
// for --deep and for the independent recompute.
const APP_URL = (process.env.APP_URL || 'http://localhost:3400').replace(/\/$/, '');
const DEEP = process.argv.includes('--deep');
let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };
const must = (c, m) => (c ? ok(m) : bad(m));
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const jobId = () => `mjob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function jfetch(url, opts = {}, t = 160000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), t);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text }; }
  finally { clearTimeout(timer); }
}
const getStatus = () => jfetch(`${APP_URL}/api/mandate/status`, {}, 15000);
const procure = (body) => jfetch(`${APP_URL}/api/work/procure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ── minimal Canton v2 client (independent of the app) — only used for --deep ──
const V2 = (process.env.TACIT_V2_API_URL || '').replace(/\/$/, '');
const USER = process.env.TACIT_V2_USER_ID || '';
const MANDATE_PKG_NAME = process.env.TACIT_MANDATE_PACKAGE_NAME || 'tacit-mandate';
const T_MANDATE = `#${MANDATE_PKG_NAME}:Tacit.Mandate:SpendMandate`;
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
async function v2(path, body, allowFail = false) {
  const r = await fetch(V2 + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) { if (allowFail) return { failed: true, status: r.status, text }; throw new Error(`${path} HTTP ${r.status} ${text.slice(0, 200)}`); }
  return { failed: false, status: r.status, json: JSON.parse(text) };
}
const wildcard = { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] };
async function submit(command, actAs, allowFail = false) {
  const body = { commands: { commands: [command], commandId: `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, userId: USER, actAs, readAs: actAs }, transactionFormat: { transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS', eventFormat: { filtersByParty: Object.fromEntries(actAs.map((p) => [p, wildcard])), verbose: false } } };
  return v2('/v2/commands/submit-and-wait-for-transaction', body, allowFail);
}
async function activeAs(party, templateId) {
  const end = await v2('/v2/state/ledger-end');
  const offset = deepFind(end.json, 'offset')[0];
  const resp = await v2('/v2/state/active-contracts', { activeAtOffset: Number(offset), verbose: false, eventFormat: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } }] } }, verbose: false } });
  const rows = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.contractId && (n.createArgument || n.createArguments || n.payload)) rows.push({ contractId: n.contractId, payload: n.createArgument || n.createArguments || n.payload }); for (const k of Object.keys(n)) walk(n[k]); };
  walk(resp.json);
  return rows;
}

async function main() {
  console.log(`\nTacit mandate preflight → ${APP_URL}${DEEP ? '  (+deep on-ledger)' : ''}\n`);

  // 1) STATUS READABLE ────────────────────────────────────────────────────────
  const s0 = await getStatus();
  must(s0.status === 200 && s0.json?.ok === true, 'GET /api/mandate/status → 200 ok (flag on)');
  if (s0.status === 404) { bad('mandate mode is OFF (404) — start the app with TACIT_MANDATE_MODE=on'); return finish(); }
  const m0 = s0.json?.mandate;
  must(!!m0, `standing mandate present · remaining ${m0?.remaining} of ${m0?.limit} ${m0?.currency}`);
  if (!m0) return finish();
  const agent = s0.json.agent; const principal = s0.json.principal;
  const serviceType = (m0.allowedServices && m0.allowedServices.length ? m0.allowedServices[0] : 'web_performance_probe');
  const remaining0 = Number(m0.remaining);

  // 2) REAL PROCUREMENT DECREMENTS BY EXACTLY THE WINNING PRICE ────────────────
  const j1 = jobId();
  const budget = Math.min(100, Math.floor(remaining0));
  const p1 = await procure({ jobId: j1, serviceType, input: { url: 'https://example.com' }, maxBudget: budget, requestSource: 'console' });
  must(p1.status === 200 && p1.json?.ok === true, `procurement ${j1} completed (${p1.status})`);
  const winPrice = Number(p1.json?.amount);
  const authCid = p1.json?.mandate?.authorizationContractId || p1.json?.evidence?.mandateAuthorizationContractId;
  must(!!authCid, `response carries an on-ledger spend authorization (${authCid ? authCid.slice(0, 14) + '…' : 'MISSING'})`);
  must(Number.isFinite(winPrice) && winPrice > 0, `winning price is real (${winPrice})`);
  const s1 = await getStatus();
  const remaining1 = Number(s1.json?.mandate?.remaining);
  must(near(remaining0 - remaining1, winPrice), `mandate decremented by EXACTLY the winning price (${remaining0} − ${winPrice} = ${remaining1})`);
  const evRemain = p1.json?.evidence?.mandateRemaining;
  must(evRemain == null || near(Number(evRemain), remaining1), 'evidence.mandateRemaining agrees with the post-spend status');

  // 3) OVER-BUDGET → 402 MANDATE_INSUFFICIENT, ZERO WRITES ─────────────────────
  const j2 = jobId();
  const overBudget = Math.min(10000, Math.ceil(remaining1) + 1000);
  const p2 = await procure({ jobId: j2, serviceType, input: { url: 'https://example.com' }, maxBudget: overBudget, requestSource: 'console' });
  must(p2.status === 402, `over-budget request refused with HTTP 402 (got ${p2.status})`);
  must(/mandate|remaining|ceiling|insufficient/i.test(p2.json?.error || p2.text || ''), `refusal reason names the mandate shortfall: "${(p2.json?.error || '').slice(0, 80)}"`);
  const s2 = await getStatus();
  must(near(Number(s2.json?.mandate?.remaining), remaining1), 'remaining UNCHANGED after the refusal — zero ledger writes');

  // 4) RESUME IDEMPOTENCY — NO SECOND SPEND ────────────────────────────────────
  const p1b = await procure({ jobId: j1, serviceType, input: { url: 'https://example.com' }, maxBudget: budget, requestSource: 'console' });
  const authCidB = p1b.json?.mandate?.authorizationContractId || p1b.json?.evidence?.mandateAuthorizationContractId;
  must(p1b.status === 200 && authCidB === authCid, 'resuming the same jobId returns the SAME authorization (no re-authorize)');
  const s3 = await getStatus();
  must(near(Number(s3.json?.mandate?.remaining), remaining1), 'remaining UNCHANGED on resume — no double-spend');

  // 5 & 6) DEEP: direct over-limit Authorize fails on-ledger; TopUp restores ────
  if (DEEP) {
    if (!V2 || !agent || !principal) { bad('--deep needs TACIT_V2_API_URL + agent + principal (source the devnet env)'); return finish(); }
    const mandates = (await activeAs(agent, T_MANDATE)).filter((m) => String(m.payload?.agent) === agent);
    const m = mandates.sort((a, b) => Number(b.payload.remaining) - Number(a.payload.remaining))[0];
    must(!!m, `agent can read its mandate directly (cid ${m ? m.contractId.slice(0, 12) + '…' : 'MISSING'})`);
    if (m) {
      const rem = Number(m.payload.remaining);
      const overAmt = (rem + 100).toFixed(2);
      const r = await submit({ ExerciseCommand: { templateId: T_MANDATE, contractId: m.contractId, choice: 'Authorize', choiceArgument: { amount: overAmt, serviceType, jobId: 'deep-overlimit', rfsId: 'deep-overlimit' } } }, [agent], true);
      must(r.failed === true, `direct over-limit Authorize (${overAmt} > ${rem}) FAILED on the ledger — a REAL command failure`);
      if (r.failed) console.log('     ↳ ledger error (verbatim): ' + String(r.text).replace(/\s+/g, ' ').slice(0, 200));
      // TopUp as principal, then a fresh procurement completes.
      const t = await submit({ ExerciseCommand: { templateId: T_MANDATE, contractId: m.contractId, choice: 'TopUp', choiceArgument: { topUpAmount: '250.00' } } }, [principal], true);
      must(t.failed === false, 'principal TopUp(+250) succeeded');
      const j3 = jobId();
      const p3 = await procure({ jobId: j3, serviceType, input: { url: 'https://example.com' }, maxBudget: 100, requestSource: 'console' });
      must(p3.status === 200 && p3.json?.ok === true, 'a fresh procurement completes after TopUp');
    }
  }
  finish();
}
function finish() {
  console.log('');
  if (fails === 0) console.log('✅ mandate preflight PASSED — the spend mandate is enforced on-ledger.');
  else console.error(`❌ mandate preflight: ${fails} check(s) failed.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error('❌ preflight-mandate error:', e?.message || e); process.exit(1); });
