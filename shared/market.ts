// Tacit — the AGENT ECONOMY, computed purely from what the AUDITOR party can
// lawfully see on the ledger. This module is PURE (browser + node safe, no I/O):
// the app's ledger layer performs the real per-party Canton queries and hands the
// raw rows here; this file only aggregates + shapes them.
//
// AUDITOR-VIEW DISCIPLINE (enforced by the caller AND by what we choose to emit):
// the market surface is built ONLY from Settlement + DeliveryReceipt contracts on
// which the pinned Auditor is a stakeholder, plus safe runner-health capability
// fields. It NEVER carries sealed bids, bid prices, losing bids, report bodies,
// runner pricing policy, or assessment TARGETS (urls/hosts). We deliberately drop
// the on-ledger `title` field, because a buyer's title can embed the target host —
// commitments, amounts, winners, times and byte lengths only.

export type MarketCurrency = 'USD.demo';

/** One Settlement as seen by the auditor (frozen Tacit.Sealed:Settlement). */
export interface RawSettlement {
  contractId: string;
  providerParty: string; // the winner's party id
  amount: number; // paid amount (== price); the value that moved
  serviceType: string | null; // Settlement.category (== serviceType); safe registry id
  rfsId: string; // ties settlement <-> receipt (1:1)
}

/** One DeliveryReceipt as seen by the auditor (TacitWork:DeliveryReceipt). */
export interface RawReceipt {
  contractId: string;
  providerParty: string; // the winner's party id
  serviceType: string | null; // DeliveryReceipt.serviceType (safe registry id)
  sha256: string; // commitment over the private report bytes
  byteLen: number;
  acceptedAtUtc: string; // ISO timestamp (real)
  settlementCid: string | null; // pointer to the Settlement
  rfsId: string; // join key
}

/** A provider in the roster, with its resolved identity + safe capability fields. */
export interface ProviderRoster {
  id: string; // providerA
  label: string; // Provider A
  party: string; // full party id
  partyShort: string; // display-safe short id
  servicesAdvertised: string[]; // from runner health (safe)
  ready: boolean; // from runner health (safe)
}

export interface MarketMeta {
  capableAgents: { ready: number; total: number };
  servicesLive: number; // distinct services advertised across ready runners
}

export interface MarketProvider {
  id: string;
  label: string;
  partyShort: string;
  earned: number; // auditor-derived sum of this provider's Settlement amounts
  wins: number; // completed jobs (accepted receipts) won, all-time
  winShare: number; // wins / completedJobs, 0..1 (all-time)
  winsByService: Record<string, number>; // per-service wins (from receipt.serviceType)
  recentWins: number; // wins within the most recent RECENT_WINDOW receipts
  recentWinShare: number; // recentWins / min(RECENT_WINDOW, completedJobs), 0..1
  servicesAdvertised: string[];
  ready: boolean;
}

/** Trailing window (most-recent receipts) for the "recent form" win share. */
export const RECENT_WINDOW = 15;

export interface MarketReceiptRow {
  acceptedAtUtc: string;
  receiptCidShort: string;
  sha256Short: string;
  byteLen: number;
  winnerLabel: string | null;
  amount: number | null; // joined from the settlement; null if not joinable
  serviceType: string | null; // from the receipt; null only if genuinely absent
}

export interface MarketTotals {
  completedJobs: number;
  totalVolume: number; // demo credits
  perService: Record<string, { jobs: number; volume: number }> | null; // null if not derivable
}

export interface MarketOverview {
  currency: MarketCurrency;
  meta: MarketMeta; // safe capability summary (ready agents, live services)
  totals: MarketTotals;
  providers: MarketProvider[];
  receipts: MarketReceiptRow[]; // reverse-chron, capped
  degradation: string[]; // honest limitations for THIS response
}

const RECEIPTS_CAP = 50;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Short, display-safe contract-id: first 10 … last 6 (never the full id in the feed). */
export function shortCid(cid: string): string {
  const s = String(cid || '');
  return s.length <= 18 ? s : `${s.slice(0, 10)}…${s.slice(-6)}`;
}
export function shortHash(h: string): string {
  const s = String(h || '');
  return s.length <= 14 ? s : `${s.slice(0, 10)}…${s.slice(-4)}`;
}

/**
 * Aggregate the auditor's lawful view of the market. Pure + deterministic:
 * identical inputs always yield an identical MarketOverview. Handles an empty
 * ledger. Degrades honestly when the receipt→settlement amount join is missing.
 */
export function buildMarketOverview(
  settlements: RawSettlement[],
  receipts: RawReceipt[],
  roster: ProviderRoster[],
  meta: MarketMeta,
): MarketOverview {
  const degradation: string[] = [];

  // rfsId -> settlement (1:1 by construction; keep the first if duplicates appear).
  const settleByRfs = new Map<string, RawSettlement>();
  for (const s of settlements) if (!settleByRfs.has(s.rfsId)) settleByRfs.set(s.rfsId, s);

  const completedJobs = receipts.length;

  // WORK-PATH SCOPING: the market counts COMPLETED work jobs only — one delivery
  // receipt each — and attaches each job's value from its settlement. Settlements
  // WITHOUT a receipt (awarded-but-undelivered work, or older negotiate-demo deals
  // the auditor can also see) are deliberately excluded, so treasury/volume/wins
  // stay mutually consistent: totalVolume == Σ perService.volume == Σ provider.earned.
  const earnedByParty = new Map<string, number>();
  const winsByParty = new Map<string, number>();
  const winsByServiceByParty = new Map<string, Record<string, number>>();
  let totalVolume = 0;
  let unjoinedAmount = 0;
  let missingService = 0;
  const perService: Record<string, { jobs: number; volume: number }> = {};

  for (const r of receipts) {
    winsByParty.set(r.providerParty, (winsByParty.get(r.providerParty) || 0) + 1);
    if (r.serviceType) {
      const m = winsByServiceByParty.get(r.providerParty) || {};
      m[r.serviceType] = (m[r.serviceType] || 0) + 1;
      winsByServiceByParty.set(r.providerParty, m);
    }
    const joined = settleByRfs.get(r.rfsId) || null;
    const amt = joined ? Number(joined.amount) || 0 : 0;
    if (joined) {
      earnedByParty.set(r.providerParty, round2((earnedByParty.get(r.providerParty) || 0) + amt));
      totalVolume = round2(totalVolume + amt);
    } else {
      unjoinedAmount++;
    }
    const svc = r.serviceType;
    if (!svc) {
      missingService++;
    } else {
      const bucket = perService[svc] || (perService[svc] = { jobs: 0, volume: 0 });
      bucket.jobs += 1;
      if (joined) bucket.volume = round2(bucket.volume + amt);
    }
  }

  // Recent form: wins within the most recent RECENT_WINDOW receipts (by acceptedAt).
  const recentReceipts = receipts.slice().sort((a, b) => (a.acceptedAtUtc < b.acceptedAtUtc ? 1 : a.acceptedAtUtc > b.acceptedAtUtc ? -1 : 0)).slice(0, RECENT_WINDOW);
  const recentTotal = recentReceipts.length;
  const recentWinsByParty = new Map<string, number>();
  for (const r of recentReceipts) recentWinsByParty.set(r.providerParty, (recentWinsByParty.get(r.providerParty) || 0) + 1);

  const providers: MarketProvider[] = roster.map((p) => {
    const wins = winsByParty.get(p.party) || 0;
    const recentWins = recentWinsByParty.get(p.party) || 0;
    return {
      id: p.id,
      label: p.label,
      partyShort: p.partyShort,
      earned: round2(earnedByParty.get(p.party) || 0),
      wins,
      winShare: completedJobs > 0 ? Math.round((wins / completedJobs) * 1000) / 1000 : 0,
      winsByService: winsByServiceByParty.get(p.party) || {},
      recentWins,
      recentWinShare: recentTotal > 0 ? Math.round((recentWins / recentTotal) * 1000) / 1000 : 0,
      servicesAdvertised: p.servicesAdvertised,
      ready: p.ready,
    };
  });

  const perServiceOut = Object.keys(perService).length > 0 ? perService : null;
  if (missingService > 0) degradation.push(`${missingService} receipt(s) carry no serviceType; excluded from the per-service split`);
  if (unjoinedAmount > 0) degradation.push(`${unjoinedAmount} completed job(s) could not be joined to a settlement; their amount is omitted (jobs still counted)`);

  // Feed: reverse-chron by acceptedAt, capped. Winner label from the roster.
  const labelByParty = new Map(roster.map((p) => [p.party, p.label] as const));
  const receiptRows: MarketReceiptRow[] = receipts
    .slice()
    .sort((a, b) => (a.acceptedAtUtc < b.acceptedAtUtc ? 1 : a.acceptedAtUtc > b.acceptedAtUtc ? -1 : 0))
    .slice(0, RECEIPTS_CAP)
    .map((r) => {
      const joined = settleByRfs.get(r.rfsId) || null;
      return {
        acceptedAtUtc: r.acceptedAtUtc,
        receiptCidShort: shortCid(r.contractId),
        sha256Short: shortHash(r.sha256),
        byteLen: Number(r.byteLen) || 0,
        winnerLabel: labelByParty.get(r.providerParty) ?? null,
        amount: joined ? round2(Number(joined.amount) || 0) : null,
        serviceType: r.serviceType,
      };
    });

  return {
    currency: 'USD.demo',
    meta,
    totals: { completedJobs, totalVolume, perService: perServiceOut },
    providers,
    receipts: receiptRows,
    degradation,
  };
}
