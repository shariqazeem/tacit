// Tacit — server-side Daml JSON Ledger API client.
//
// Talks to the Canton sandbox's JSON API over HTTP. Dev auth: HS256 JWTs with a
// dummy secret (the sandbox runs --allow-insecure-tokens, so the signature is
// not verified). The custom `https://daml.com/ledger-api` claim carries the
// ledgerId/applicationId and actAs/readAs (or admin) — and `ledgerId` is
// REQUIRED for command submission (/v1/create), which is the subtle bit.
//
// All config has working defaults for the local sandbox and can be overridden
// by env for the deployment VM.

import crypto from 'crypto';

const JSON_API = process.env.DAML_JSON_API_URL || 'http://localhost:7575';
const LEDGER_ID = process.env.DAML_LEDGER_ID || 'sandbox';
const APP_ID = process.env.DAML_APPLICATION_ID || 'tacit';
const SECRET = process.env.DAML_TOKEN_SECRET || 'tacit-dev-secret';
export const PACKAGE_ID =
  process.env.TACIT_PACKAGE_ID || '66e7ac22bcf8dce96c8449b584b85ba19e4dd03c48211b1d5990e0ceb3af5e04';

export const T = {
  Rfs: `${PACKAGE_ID}:Tacit.Sealed:Rfs`,
  SealedBid: `${PACKAGE_ID}:Tacit.Sealed:SealedBid`,
  Settlement: `${PACKAGE_ID}:Tacit.Sealed:Settlement`,
};

const b64url = (s: string) => Buffer.from(s).toString('base64url');

function mint(claims: Record<string, unknown>): string {
  const c = { applicationId: APP_ID, ledgerId: LEDGER_ID, ...claims };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const p = b64url(JSON.stringify({ exp, 'https://daml.com/ledger-api': c }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
const adminToken = () => mint({ admin: true });
const partyToken = (parties: string[]) => mint({ actAs: parties, readAs: parties });

async function call(path: string, token: string, body?: unknown, method = 'POST', timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(JSON_API + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { http: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function ledgerReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(JSON_API + '/livez', { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** Reuse an existing party with this hint, or allocate it. Returns the full party id. */
export async function ensureParty(hint: string): Promise<string> {
  const list = await call('/v1/parties', adminToken(), undefined, 'GET');
  const found = (list.json?.result || [])
    .map((p: any) => p.identifier as string)
    .find((id: string) => id.startsWith(hint + '::'));
  if (found) return found;
  const r = await call('/v1/parties/allocate', adminToken(), { identifierHint: hint });
  if (r.http !== 200 || r.json?.status !== 200) throw new Error('allocate failed: ' + JSON.stringify(r.json).slice(0, 200));
  return r.json.result.identifier as string;
}

/** Create a contract, submitting as `actAs` (one party, or several for multi-signatory). */
export async function create(templateId: string, payload: Record<string, unknown>, actAs: string[]): Promise<string> {
  const r = await call('/v1/create', partyToken(actAs), { templateId, payload });
  if (r.http !== 200 || r.json?.status !== 200) throw new Error('create failed: ' + JSON.stringify(r.json).slice(0, 300));
  return r.json.result.contractId as string;
}

/** Query active contracts visible to `party` (the ledger enforces visibility). */
export async function queryAs(party: string, templateIds: string[], query?: Record<string, unknown>): Promise<any[]> {
  const r = await call('/v1/query', partyToken([party]), query ? { templateIds, query } : { templateIds });
  return r.json?.result || [];
}

/**
 * Exercise a choice on a contract, submitting as `actAs`. Returns the choice's
 * result (e.g. the ContractId of a contract the choice created).
 */
export async function exercise(
  templateId: string,
  contractId: string,
  choice: string,
  argument: Record<string, unknown>,
  actAs: string[],
): Promise<any> {
  const r = await call('/v1/exercise', partyToken(actAs), { templateId, contractId, choice, argument });
  if (r.http !== 200 || r.json?.status !== 200) throw new Error('exercise failed: ' + JSON.stringify(r.json).slice(0, 300));
  return r.json.result.exerciseResult;
}
