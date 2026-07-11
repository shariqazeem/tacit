// Tacit — Adapter A: the Daml 2.x v1 HTTP JSON API (local sandbox).
//
// This is the ORIGINAL client, unchanged in behavior — it stays the default
// (TACIT_LEDGER_MODE unset) and is the honest DEMO FALLBACK / offline tier.
//
// Dev auth: HS256 JWTs with a dummy secret (the sandbox runs
// --allow-insecure-tokens, so the signature is not verified). The custom
// `https://daml.com/ledger-api` claim carries ledgerId/applicationId and
// actAs/readAs (or admin) — and `ledgerId` is REQUIRED for command submission
// (/v1/create), which is the subtle bit.

import crypto from 'crypto';
import type { ContractRow, LedgerAdapter, LedgerHealth } from './types';
import { APP_ID, V1_JSON_API, V1_LEDGER_ID, V1_PACKAGE_ID, V1_PACKAGE_FROM_ENV, V1_SECRET } from './config';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

function mint(claims: Record<string, unknown>): string {
  const c = { applicationId: APP_ID, ledgerId: V1_LEDGER_ID, ...claims };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const p = b64url(JSON.stringify({ exp, 'https://daml.com/ledger-api': c }));
  const sig = crypto.createHmac('sha256', V1_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
const adminToken = () => mint({ admin: true });
const partyToken = (parties: string[]) => mint({ actAs: parties, readAs: parties });

async function call(path: string, token: string, body?: unknown, method = 'POST', timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(V1_JSON_API + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { http: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export const sandboxV1: LedgerAdapter = {
  mode: 'sandbox',
  ledgerUrl: V1_JSON_API,
  packageId: V1_PACKAGE_ID,
  packageIdFromEnv: V1_PACKAGE_FROM_ENV,

  async ensureParty(hint: string): Promise<string> {
    const list = await call('/v1/parties', adminToken(), undefined, 'GET');
    const found = (list.json?.result || [])
      .map((p: any) => p.identifier as string)
      .find((id: string) => id.startsWith(hint + '::'));
    if (found) return found;
    const r = await call('/v1/parties/allocate', adminToken(), { identifierHint: hint });
    if (r.http !== 200 || r.json?.status !== 200)
      throw new Error('allocate failed: ' + JSON.stringify(r.json).slice(0, 200));
    return r.json.result.identifier as string;
  },

  async create(templateId: string, payload: Record<string, unknown>, actAs: string[]): Promise<string> {
    const r = await call('/v1/create', partyToken(actAs), { templateId, payload });
    if (r.http !== 200 || r.json?.status !== 200)
      throw new Error('create failed: ' + JSON.stringify(r.json).slice(0, 300));
    return r.json.result.contractId as string;
  },

  async queryAs(party: string, templateIds: string[], query?: Record<string, unknown>): Promise<ContractRow[]> {
    const r = await call('/v1/query', partyToken([party]), query ? { templateIds, query } : { templateIds });
    return (r.json?.result || []) as ContractRow[];
  },

  async exercise(
    templateId: string,
    contractId: string,
    choice: string,
    argument: Record<string, unknown>,
    actAs: string[],
  ): Promise<any> {
    const r = await call('/v1/exercise', partyToken(actAs), { templateId, contractId, choice, argument });
    if (r.http !== 200 || r.json?.status !== 200)
      throw new Error('exercise failed: ' + JSON.stringify(r.json).slice(0, 300));
    return r.json.result.exerciseResult;
  },

  async reachable(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(V1_JSON_API + '/livez', { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  },

  async health(): Promise<LedgerHealth> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(V1_JSON_API + '/livez', { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok
        ? { reachable: true, error: null }
        : { reachable: false, error: `JSON API returned HTTP ${res.status}` };
    } catch (e: any) {
      return { reachable: false, error: String(e?.message || e) };
    }
  },
};
