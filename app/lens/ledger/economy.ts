// Tacit — the LEDGER ECONOMY (read-only, derived live from Canton).
//
// Every number here is queried from the ledger AS a party at request time —
// never cached, never invented. Provider "wealth" is the sum of the demo IOUs
// each provider currently OWNS (their winnings across every deal ever settled on
// this ledger); "deals" are Settlement contracts a party is a stakeholder of.
// If Canton is unreachable, callers get { available:false } and the UI hides the
// section rather than fabricate stats.

import { queryAs, ensureParty, T, ledgerReachable, LEDGER_URL, partyHint } from './client';

const PROVIDERS = [
  { id: 'providerA', label: 'Provider A', hint: 'ProviderA' },
  { id: 'providerB', label: 'Provider B', hint: 'ProviderB' },
  { id: 'providerC', label: 'Provider C', hint: 'ProviderC' },
] as const;

export interface ProviderEconomy {
  id: string;
  label: string;
  earnings: number;
  deals: number;
}

export interface SettlementRow {
  rfsId: string;
  title: string; // on-ledger deal title
  category: string; // on-ledger service category
  winner: string; // provider label (or short party id)
  price: number;
  paid: { amount: number; currency: string } | null;
  contractId: string;
}

export interface Economy {
  available: boolean;
  ledgerDerived: true;
  ledgerUrl: string;
  currency: 'USD.demo';
  totals: { deals: number; moved: number };
  providers: ProviderEconomy[];
  recent: SettlementRow[];
  updatedAt: string;
}

export interface PartyEconomy {
  available: boolean;
  ledgerDerived: true;
  ledgerUrl: string;
  party: string; // hint/name
  earnings: number;
  deals: number;
  recent: SettlementRow[];
  updatedAt: string;
}

/** IOUs a party currently owns → its accumulated USD.demo earnings. */
async function iouStats(party: string): Promise<{ earnings: number; deals: number }> {
  const rows = await queryAs(party, [T.Iou], { currency: 'USD.demo' });
  const owned = rows.filter((c: any) => c?.payload?.owner === party);
  const earnings = owned.reduce((s: number, c: any) => s + Number(c.payload.amount), 0);
  return { earnings: Math.round(earnings * 100) / 100, deals: owned.length };
}

function paidOf(payload: any): { amount: number; currency: string } | null {
  const p = payload?.paid;
  if (!p) return null;
  // Daml tuple (Decimal, Text) → JSON { _1, _2 }.
  return { amount: Number(p._1 ?? p['1'] ?? 0), currency: String(p._2 ?? p['2'] ?? 'USD.demo') };
}

/** Settlements a party is a stakeholder of, most-recent first (rfsId encodes time). */
async function settlementsAs(party: string, partyLabel: (id: string) => string, limit = 6): Promise<SettlementRow[]> {
  const rows = await queryAs(party, [T.Settlement]);
  return rows
    .map((c: any) => ({
      rfsId: String(c.payload.rfsId),
      title: String(c.payload.title ?? ''),
      category: String(c.payload.category ?? ''),
      winner: partyLabel(c.payload.provider),
      price: Number(c.payload.price),
      paid: paidOf(c.payload),
      contractId: String(c.contractId),
    }))
    .sort((a, b) => (a.rfsId < b.rfsId ? 1 : -1))
    .slice(0, limit);
}

/** The default (buyer's-eye) economy: provider wealth + recent settlements. */
export async function getEconomy(): Promise<Economy | { available: false }> {
  if (!(await ledgerReachable())) return { available: false };
  try {
    const buyer = await ensureParty('Buyer');
    const provIds: Record<string, string> = {};
    const providers: ProviderEconomy[] = [];
    for (const p of PROVIDERS) {
      const party = await ensureParty(p.hint);
      provIds[party] = p.label;
      const { earnings, deals } = await iouStats(party);
      providers.push({ id: p.id, label: p.label, earnings, deals });
    }
    const labelFor = (id: string) => provIds[id] ?? `${String(id).slice(0, 6)}…`;
    const recent = await settlementsAs(buyer, labelFor);

    const moved = providers.reduce((s, p) => s + p.earnings, 0);
    const deals = providers.reduce((s, p) => s + p.deals, 0);
    return {
      available: true,
      ledgerDerived: true,
      ledgerUrl: LEDGER_URL,
      currency: 'USD.demo',
      totals: { deals, moved: Math.round(moved * 100) / 100 },
      providers,
      recent,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return { available: false };
  }
}

/** A specific party's private view — its own settlements + earnings, nothing else. */
export async function getPartyEconomy(name: string): Promise<PartyEconomy | { available: false }> {
  if (!(await ledgerReachable())) return { available: false };
  try {
    const provLabels: Record<string, string> = {};
    for (const p of PROVIDERS) provLabels[await ensureParty(p.hint)] = p.label;
    const party = await ensureParty(partyHint(name));
    const { earnings, deals } = await iouStats(party);
    const labelFor = (id: string) => provLabels[id] ?? `${String(id).slice(0, 6)}…`;
    const recent = await settlementsAs(party, labelFor);
    return {
      available: true,
      ledgerDerived: true,
      ledgerUrl: LEDGER_URL,
      party: name,
      earnings,
      deals: recent.length,
      recent,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return { available: false };
  }
}

/** Per-provider balances for balance-aware bidding (keyed by persona id). */
export async function getProviderBalances(): Promise<Record<string, { earnings: number; deals: number }>> {
  const out: Record<string, { earnings: number; deals: number }> = {};
  try {
    for (const p of PROVIDERS) {
      const party = await ensureParty(p.hint);
      out[p.id] = await iouStats(party);
    }
  } catch {
    /* best-effort — bidding proceeds without balance context */
  }
  return out;
}
