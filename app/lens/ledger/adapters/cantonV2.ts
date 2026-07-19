// Tacit — Adapter B: the Canton 3.x v2 JSON Ledger API.
//
// Powers BOTH canton3-local (auth off/static, for the local rehearsal that
// de-risks devnet) and devnet (OAuth2 client-credentials + the real endpoint).
// The two differ ONLY in env (TACIT_V2_API_URL + TACIT_V2_AUTH) — the code path
// is identical, which is what makes devnet a one-env-var flip.
//
// Wire shapes follow the Canton 3.x JSON Ledger API (docs.digitalasset.com):
//   • command submission → POST /v2/commands/submit-and-wait-for-transaction
//   • active contracts    → POST /v2/state/active-contracts (as-of ledger end)
//   • ledger end          → GET  /v2/state/ledger-end
//   • parties             → GET/POST /v2/parties
//   • DAR upload          → POST /v2/packages  (application/octet-stream)
// Response parsing is envelope-agnostic (deepFind) so minor version differences
// in the transaction wrapper don't break extraction; the exact shapes are
// pinned empirically against a live Canton 3.4.11 participant in §2.

import type { ContractRow, LedgerAdapter, LedgerHealth } from './types';
import { classifyLedgerError } from '@/shared/ledgerErrors';
import {
  APP_ID,
  LEDGER_MODE,
  OAUTH,
  V2_API_URL,
  V2_AUTH,
  V2_PACKAGE_FROM_ENV,
  V2_PACKAGE_ID,
  V2_STATIC_TOKEN,
  V2_USER_ID,
} from './config';

// ── OAuth2 client-credentials token (cached, refresh-on-401) ─────────────────
let cachedToken: { value: string; exp: number } | null = null;

async function oauthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.exp - 30_000 > now) return cachedToken.value;
  if (!OAUTH.tokenUrl || !OAUTH.clientId) {
    throw new Error('OAuth is enabled but TACIT_DEVNET_TOKEN_URL / TACIT_DEVNET_CLIENT_ID are not set');
  }
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: OAUTH.clientId,
    client_secret: OAUTH.clientSecret,
  });
  if (OAUTH.audience) form.set('audience', OAUTH.audience);
  if (OAUTH.scope) form.set('scope', OAUTH.scope);
  const res = await fetch(OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth token request failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (!j.access_token) throw new Error('OAuth response missing access_token');
  cachedToken = { value: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function authHeaders(forceFresh = false): Promise<Record<string, string>> {
  if (V2_AUTH === 'none') return {};
  if (V2_AUTH === 'static') return V2_STATIC_TOKEN ? { Authorization: `Bearer ${V2_STATIC_TOKEN}` } : {};
  if (forceFresh) cachedToken = null;
  return { Authorization: `Bearer ${await oauthToken()}` };
}

// ── HTTP with auth + one refresh-on-401 retry ────────────────────────────────
interface ReqOpts {
  method?: string;
  body?: unknown;
  octetBody?: Uint8Array;
  timeoutMs?: number;
}

async function req(path: string, opts: ReqOpts = {}): Promise<{ http: number; json: any; text: string }> {
  const { method = 'GET', body, octetBody, timeoutMs = 20000 } = opts;
  const send = async (forceFresh: boolean) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { ...(await authHeaders(forceFresh)) };
      let payload: BodyInit | undefined;
      if (octetBody) {
        headers['Content-Type'] = 'application/octet-stream';
        payload = octetBody as unknown as BodyInit;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      return await fetch(V2_API_URL + path, { method, headers, body: payload, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  let res = await send(false);
  if (res.status === 401 && V2_AUTH === 'oauth') res = await send(true); // token expired → refresh once
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { http: res.status, json, text };
}

// ── envelope-agnostic response parsing ───────────────────────────────────────
function deepCollect(node: any, key: string, out: any[] = []): any[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const x of node) deepCollect(x, key, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      deepCollect(v, key, out);
    }
  }
  return out;
}

/** All object nodes that contain every one of `keys` (e.g. a CreatedEvent has contractId + createArgument). */
function deepObjectsWith(node: any, keys: string[], out: any[] = []): any[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const x of node) deepObjectsWith(x, keys, out);
    return out;
  }
  if (typeof node === 'object') {
    if (keys.every((k) => k in node)) out.push(node);
    for (const v of Object.values(node)) deepObjectsWith(v, keys, out);
  }
  return out;
}

const payloadOf = (ev: any) => ev.createArgument ?? ev.createArguments ?? ev.payload;

/** Normalize the created events in any response into ContractRows, deduped by contractId. */
function createdRows(resp: any): ContractRow[] {
  const nodes = deepObjectsWith(resp, ['contractId']).filter((n) => payloadOf(n) !== undefined);
  const seen = new Set<string>();
  const rows: ContractRow[] = [];
  for (const n of nodes) {
    if (seen.has(n.contractId)) continue;
    seen.add(n.contractId);
    rows.push({ contractId: n.contractId, templateId: n.templateId, payload: payloadOf(n) });
  }
  return rows;
}

// ── the adapter ──────────────────────────────────────────────────────────────
const cmdId = () => `${APP_ID}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

// LEDGER_EFFECTS shape → the returned transaction carries created events AND
// exercised events (with exerciseResult), which create/exercise both need.
function ledgerEffectsFormat(actAs: string[]) {
  const wildcard = { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] };
  return {
    transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
    eventFormat: {
      filtersByParty: Object.fromEntries(actAs.map((p) => [p, wildcard])),
      verbose: false,
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The shared devnet validator imposes a per-credential WRITE-BURST limit: a full
// procurement fires ~11 submits in a short window and can trip a 403 "security-sensitive"
// rejection. That is a REJECTION (the command never committed), so retrying is safe — and
// because the commandId is FIXED across retries, Canton's command dedup is a second guard
// against any double-execution. We back off and retry ONLY the throttle class; every other
// failure throws immediately. Env-tunable; 0 retries = today's behavior.
const SUBMIT_RETRIES = Math.max(0, Number(process.env.TACIT_SUBMIT_RETRIES ?? 5));
const SUBMIT_BACKOFF_MS = [1500, 3000, 6000, 10000, 15000];

async function submit(command: Record<string, unknown>, actAs: string[]): Promise<any> {
  // v2 wraps the JsCommands (commands/commandId/userId/actAs) under a `commands`
  // object, with transactionFormat a sibling. userId must be the token's user.
  // commandId is generated ONCE and reused across retries (dedup-safe).
  const body = {
    commands: { commands: [command], commandId: cmdId(), userId: V2_USER_ID, actAs, readAs: actAs },
    transactionFormat: ledgerEffectsFormat(actAs),
  };
  let last = '';
  for (let attempt = 0; ; attempt++) {
    const r = await req('/v2/commands/submit-and-wait-for-transaction', { method: 'POST', body });
    if (r.http >= 200 && r.http < 300) return r.json;
    last = r.text || `HTTP ${r.http}`;
    const throttled = classifyLedgerError(last) === 'throttled';
    if (throttled && attempt < SUBMIT_RETRIES) {
      await sleep(SUBMIT_BACKOFF_MS[Math.min(attempt, SUBMIT_BACKOFF_MS.length - 1)]);
      continue; // the shared validator is bursting — wait out the window and retry the same command
    }
    throw new Error(`submit failed: HTTP ${r.http} ${last.slice(0, 300)}`);
  }
}

async function ledgerEnd(): Promise<number> {
  const r = await req('/v2/state/ledger-end', { method: 'GET', timeoutMs: 5000 });
  if (r.http < 200 || r.http >= 300) throw new Error(`ledger-end failed: HTTP ${r.http} ${r.text.slice(0, 200)}`);
  const offs = deepCollect(r.json, 'offset');
  return offs.length ? Number(offs[0]) : 0;
}

// On a shared validator (devnet) the submitting user must hold CanActAs on each
// party it acts as — so grant it right after allocating. Best-effort + idempotent.
async function grantActAs(party: string): Promise<void> {
  if (!V2_USER_ID) return;
  try {
    await req(`/v2/users/${encodeURIComponent(V2_USER_ID)}/rights`, {
      method: 'POST',
      body: { userId: V2_USER_ID, identityProviderId: '', rights: [{ kind: { CanActAs: { value: { party } } } }] },
    });
  } catch {
    /* already granted, or granting is restricted — the caller proceeds regardless */
  }
}

export const cantonV2: LedgerAdapter = {
  mode: LEDGER_MODE, // 'canton3-local' | 'devnet'
  ledgerUrl: V2_API_URL,
  packageId: V2_PACKAGE_ID,
  packageIdFromEnv: V2_PACKAGE_FROM_ENV,

  async ensureParty(hint: string): Promise<string> {
    // The party *listing* can hang on a shared validator (observed: GET /v2/parties
    // aborts at its timeout). Treat listing as best-effort — on any failure fall
    // through to allocation (POST works even when GET does not).
    try {
      const list = await req('/v2/parties', { method: 'GET', timeoutMs: 4000 });
      const known = deepCollect(list.json, 'party').filter((p: any) => typeof p === 'string');
      const found = known.find((id: string) => id.split('::')[0] === hint);
      if (found) return found;
    } catch {
      /* listing unavailable → allocate below */
    }
    const alloc = await req('/v2/parties', { method: 'POST', body: { partyIdHint: hint, identityProviderId: '' } });
    if (alloc.http < 200 || alloc.http >= 300)
      throw new Error(`allocate party failed: HTTP ${alloc.http} ${alloc.text.slice(0, 200)}`);
    const created = deepCollect(alloc.json, 'party').filter((p: any) => typeof p === 'string');
    if (!created.length) throw new Error('allocate party: no party id in response ' + alloc.text.slice(0, 200));
    await grantActAs(created[0]);
    return created[0];
  },

  async create(templateId: string, payload: Record<string, unknown>, actAs: string[]): Promise<string> {
    const resp = await submit({ CreateCommand: { templateId, createArguments: payload } }, actAs);
    const created = createdRows(resp).find((r) => !templateId || !r.templateId || sameTemplate(r.templateId, templateId));
    if (!created) throw new Error('create: no created event in response ' + JSON.stringify(resp).slice(0, 300));
    return created.contractId;
  },

  async exercise(
    templateId: string,
    contractId: string,
    choice: string,
    argument: Record<string, unknown>,
    actAs: string[],
  ): Promise<any> {
    const resp = await submit(
      { ExerciseCommand: { templateId, contractId, choice, choiceArgument: argument } },
      actAs,
    );
    // The choice's own exercised event carries its return value; match by choice
    // name so a nested exercise (e.g. Award → Accept) doesn't shadow the root.
    const exEvents = deepObjectsWith(resp, ['exerciseResult']);
    const match = exEvents.find((e) => e.choice === choice) ?? exEvents[0];
    return match?.exerciseResult;
  },

  async queryAs(party: string, templateIds: string[], query?: Record<string, unknown>): Promise<ContractRow[]> {
    const offset = await ledgerEnd();
    const body = {
      activeAtOffset: offset,
      verbose: false,
      eventFormat: {
        filtersByParty: {
          [party]: {
            cumulative: templateIds.map((tid) => ({
              identifierFilter: { TemplateFilter: { value: { templateId: tid, includeCreatedEventBlob: false } } },
            })),
          },
        },
        verbose: false,
      },
    };
    const r = await req('/v2/state/active-contracts', { method: 'POST', body });
    if (r.http < 200 || r.http >= 300) throw new Error(`active-contracts failed: HTTP ${r.http} ${r.text.slice(0, 200)}`);
    let rows = createdRows(r.json);
    // Apply the optional payload predicate exactly as v1 did server-side.
    if (query) {
      const entries = Object.entries(query);
      rows = rows.filter((row) => entries.every(([k, v]) => String(row.payload?.[k]) === String(v)));
    }
    return rows;
  },

  async reachable(): Promise<boolean> {
    try {
      const r = await req('/v2/state/ledger-end', { method: 'GET', timeoutMs: 3000 });
      return r.http >= 200 && r.http < 300;
    } catch {
      return false;
    }
  },

  async health(): Promise<LedgerHealth> {
    try {
      const r = await req('/v2/state/ledger-end', { method: 'GET', timeoutMs: 4000 });
      if (r.http < 200 || r.http >= 300) return { reachable: false, error: `ledger-end HTTP ${r.http}` };
      let partyCount: number | undefined;
      try {
        const list = await req('/v2/parties', { method: 'GET', timeoutMs: 4000 });
        partyCount = deepCollect(list.json, 'party').filter((p: any) => typeof p === 'string').length || undefined;
      } catch {
        /* partyCount is best-effort */
      }
      return { reachable: true, error: null, partyCount };
    } catch (e: any) {
      return { reachable: false, error: String(e?.message || e) };
    }
  },

  async uploadDar(dar: Uint8Array): Promise<void> {
    const r = await req('/v2/packages', { method: 'POST', octetBody: dar, timeoutMs: 60000 });
    if (r.http < 200 || r.http >= 300) throw new Error(`DAR upload failed: HTTP ${r.http} ${r.text.slice(0, 300)}`);
  },
};

/** Compare two templateId strings tolerant of packageId vs #package-name prefixes. */
function sameTemplate(a: string, b: string): boolean {
  if (a === b) return true;
  const tail = (s: string) => s.split(':').slice(-2).join(':'); // Module:Entity
  return tail(a) === tail(b);
}
