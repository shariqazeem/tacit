// Minimal Canton 3.x v2 JSON Ledger API client for the runner — direct HTTP,
// OAuth2 client-credentials (cached + refresh-on-401), same verified wire shapes
// as the app's cantonV2 adapter. Secrets are never logged.
import type { RunnerConfig } from './config.js';
import { classifyLedgerError } from './_ledgerErrors.js';

let cached: { v: string; exp: number } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Same per-credential write-burst mitigation as the app: a 403 "security-sensitive"
// is a REJECTION (never committed), so retrying the SAME command (fixed commandId,
// dedup-safe) after a backoff rides out the burst. Only the throttle class is retried.
const SUBMIT_RETRIES = Math.max(0, Number(process.env.TACIT_SUBMIT_RETRIES ?? 5));
const SUBMIT_BACKOFF_MS = [1500, 3000, 6000, 10000, 15000];

async function token(cfg: RunnerConfig, force = false): Promise<string> {
  const now = Date.now();
  if (!force && cached && cached.exp - 30_000 > now) return cached.v;
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret });
  if (cfg.audience) form.set('audience', cfg.audience);
  if (cfg.scope) form.set('scope', cfg.scope);
  const r = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!r.ok) throw new Error(`OAuth token request failed: HTTP ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  if (!j.access_token) throw new Error('OAuth response missing access_token');
  cached = { v: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return cached.v;
}

async function req(cfg: RunnerConfig, path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ http: number; json: any; text: string }> {
  const { method = 'GET', body } = opts;
  const send = async (force: boolean) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${await token(cfg, force)}` };
    let payload: string | undefined;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    return fetch(cfg.apiUrl.replace(/\/$/, '') + path, { method, headers, body: payload });
  };
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { http: res.status, json, text };
}

// ── envelope-agnostic parsing (same as the app adapter) ──────────────────────
export function deepCollect(node: any, key: string, out: any[] = []): any[] {
  if (node == null) return out;
  if (Array.isArray(node)) { for (const x of node) deepCollect(x, key, out); return out; }
  if (typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === key) out.push(v); deepCollect(v, key, out); }
  return out;
}
function deepObjectsWith(node: any, keys: string[], out: any[] = []): any[] {
  if (node == null) return out;
  if (Array.isArray(node)) { for (const x of node) deepObjectsWith(x, keys, out); return out; }
  if (typeof node === 'object') { if (keys.every((k) => k in node)) out.push(node); for (const v of Object.values(node)) deepObjectsWith(v, keys, out); }
  return out;
}
const payloadOf = (e: any) => e.createArgument ?? e.createArguments ?? e.payload;

export interface Row { contractId: string; payload: any; }

export class Canton {
  constructor(private cfg: RunnerConfig) {}

  private cmdId = () => `runner-${this.cfg.userId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  private ledgerEffects(actAs: string[]) {
    const w = { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] };
    return { transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS', eventFormat: { filtersByParty: Object.fromEntries(actAs.map((p) => [p, w])), verbose: false } };
  }

  async submit(command: Record<string, unknown>, actAs: string[]): Promise<any> {
    // commandId generated ONCE, reused across retries (dedup-safe).
    const body = { commands: { commands: [command], commandId: this.cmdId(), userId: this.cfg.userId, actAs, readAs: actAs }, transactionFormat: this.ledgerEffects(actAs) };
    let last = '';
    for (let attempt = 0; ; attempt++) {
      const r = await req(this.cfg, '/v2/commands/submit-and-wait-for-transaction', { method: 'POST', body });
      if (r.http >= 200 && r.http < 300) return r.json;
      last = r.text || `HTTP ${r.http}`;
      if (classifyLedgerError(last) === 'throttled' && attempt < SUBMIT_RETRIES) {
        await sleep(SUBMIT_BACKOFF_MS[Math.min(attempt, SUBMIT_BACKOFF_MS.length - 1)]);
        continue;
      }
      throw new Error(`submit failed HTTP ${r.http}: ${last.slice(0, 300)}`);
    }
  }

  async create(templateId: string, args: Record<string, unknown>, actAs: string[]): Promise<string> {
    const resp = await this.submit({ CreateCommand: { templateId, createArguments: args } }, actAs);
    const created = deepObjectsWith(resp, ['contractId']).find((n) => payloadOf(n) !== undefined);
    if (!created) throw new Error('create: no created event');
    return created.contractId;
  }

  async exercise(templateId: string, contractId: string, choice: string, choiceArgument: Record<string, unknown>, actAs: string[]): Promise<any> {
    const resp = await this.submit({ ExerciseCommand: { templateId, contractId, choice, choiceArgument } }, actAs);
    const ex = deepObjectsWith(resp, ['exerciseResult']);
    return (ex.find((e) => e.choice === choice) ?? ex[0])?.exerciseResult;
  }

  private async ledgerEnd(): Promise<number> {
    const r = await req(this.cfg, '/v2/state/ledger-end');
    return deepCollect(r.json, 'offset')[0] ?? 0;
  }

  /** Active contracts of `templateId` visible to `party`. */
  async query(party: string, templateId: string): Promise<Row[]> {
    const offset = await this.ledgerEnd();
    const body = { activeAtOffset: offset, verbose: false, eventFormat: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: false } } } }] } }, verbose: false } };
    const r = await req(this.cfg, '/v2/state/active-contracts', { method: 'POST', body });
    if (r.http < 200 || r.http >= 300) throw new Error(`active-contracts HTTP ${r.http}: ${r.text.slice(0, 200)}`);
    const seen = new Set<string>();
    return deepObjectsWith(r.json, ['contractId']).filter((n) => payloadOf(n) !== undefined && !seen.has(n.contractId) && seen.add(n.contractId)).map((n) => ({ contractId: n.contractId, payload: payloadOf(n) }));
  }
}
