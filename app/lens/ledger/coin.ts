// Real CANTON COIN (Splice Amulet) — the network's native asset, on devnet. A genuine
// real-token surface ALONGSIDE the demo-credit settlement: read the live on-ledger balance
// and tap the devnet faucet to mint real CC. Talks the Splice Validator/Wallet API directly.
//
// This does NOT touch the frozen settlement Daml — job settlement still moves a USD.demo
// voucher; this proves the real-CC rail is wired and lets a user hold real Canton Coin.
// Honesty: the wallet API acts as THIS validator's onboarded party — a shared devnet wallet,
// not a per-user custody account (that's the roadmap).

const WALLET_URL = (process.env.TACIT_WALLET_API_URL || '').replace(/\/$/, '');

/** On only when a wallet API URL + OAuth creds are configured. */
export function coinEnabled(): boolean {
  return !!WALLET_URL && !!process.env.TACIT_DEVNET_TOKEN_URL && !!process.env.TACIT_DEVNET_CLIENT_ID;
}

// OAuth2 client-credentials token, cached (same credential the ledger API uses).
let tok: { v: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (tok && tok.exp > Date.now() + 30_000) return tok.v;
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TACIT_DEVNET_CLIENT_ID || '', client_secret: process.env.TACIT_DEVNET_CLIENT_SECRET || '' });
  if (process.env.TACIT_DEVNET_AUDIENCE) form.set('audience', process.env.TACIT_DEVNET_AUDIENCE);
  if (process.env.TACIT_DEVNET_SCOPE) form.set('scope', process.env.TACIT_DEVNET_SCOPE);
  const r = await fetch(process.env.TACIT_DEVNET_TOKEN_URL || '', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!r.ok) throw new Error(`coin token HTTP ${r.status}`);
  const j = await r.json();
  tok = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tok.v;
}

async function wapi(path: string, init?: RequestInit, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const t = await token();
    const r = await fetch(WALLET_URL + path, { ...init, signal: ctrl.signal, headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}` } });
    const text = await r.text();
    if (!r.ok) throw new Error(`wallet ${path} HTTP ${r.status} ${text.slice(0, 160)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

export interface CoinStatus {
  enabled: boolean;
  ledgerReachable: boolean;
  partyId: string | null;
  onboarded: boolean;
  walletInstalled: boolean;
  unlocked: number; // effective unlocked Canton Coin
  locked: number;
  round: number | null; // the mining round the balance is as-of
}

export async function getCoinStatus(): Promise<CoinStatus> {
  const off = { enabled: false, ledgerReachable: false, partyId: null, onboarded: false, walletInstalled: false, unlocked: 0, locked: 0, round: null };
  if (!coinEnabled()) return off;
  try {
    const [bal, us] = await Promise.all([
      wapi('/api/validator/v0/wallet/balance'),
      wapi('/api/validator/v0/wallet/user-status').catch(() => ({})),
    ]);
    return {
      enabled: true,
      ledgerReachable: true,
      partyId: us?.party_id ? String(us.party_id) : null,
      onboarded: !!us?.user_onboarded,
      walletInstalled: !!us?.user_wallet_installed,
      unlocked: Number(bal?.effective_unlocked_qty || 0),
      locked: Number(bal?.effective_locked_qty || 0),
      round: bal?.round != null ? Number(bal.round) : null,
    };
  } catch {
    return { ...off, enabled: true };
  }
}

/** Tap real Canton Coin from the devnet faucet (Splice mint). Returns the new Amulet contract id. */
export async function tapCoin(amount: number): Promise<{ contractId: string }> {
  const j = await wapi('/api/validator/v0/wallet/tap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: String(amount) }) }, 30000);
  return { contractId: String(j?.contract_id || '') };
}
