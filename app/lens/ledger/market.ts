// Tacit — the AGENT ECONOMY, read live from the ledger through the AUDITOR's eyes.
//
// This module queries ONLY as the pinned Auditor party (plus safe runner-health
// capability fields). It is the server-side embodiment of the privacy model: it can
// show settlements + receipts because the auditor is a stakeholder of those, and it
// literally CANNOT show sealed bids or report bodies because the auditor is not a
// stakeholder of a SealedBid or a PrivateDelivery, so Canton never returns them.
//
// The displayed treasury is auditor-derived from Settlement amounts. The separate
// Iou-balance reconciliation (auditor cannot see Ious) lives in the live preflight,
// which is allowed to query as each provider — keeping THIS surface auditor-pure.

import { queryAs, ensureParty, ledgerReachable, T } from './client';
import { TW } from './work';
import { fetchRunners } from './runnerHealth';
import {
  buildMarketOverview,
  type MarketOverview,
  type ProviderRoster,
  type RawReceipt,
  type RawSettlement,
} from '@/shared/market';

const PROVIDERS = [
  { id: 'providerA', label: 'Provider A', hint: 'ProviderA' },
  { id: 'providerB', label: 'Provider B', hint: 'ProviderB' },
  { id: 'providerC', label: 'Provider C', hint: 'ProviderC' },
] as const;

// Display-safe short party id that PRESERVES the distinguishing name segment.
// Party ids look like `Tacit43kfProviderA::1220…acf8` — the three providers share a
// prefix + fingerprint suffix, so a naive head…tail truncation collapses them. We
// keep the readable head + a little fingerprint. Party ids are public identifiers.
function shortParty(p: string): string {
  const [head, fp = ''] = String(p).split('::');
  const h = head.length > 24 ? `${head.slice(0, 24)}…` : head;
  if (fp) return `${h}::${fp.slice(0, 4)}…`;
  return p.length > 20 ? `${p.slice(0, 16)}…${p.slice(-4)}` : p;
}

export interface MarketResponse extends MarketOverview {
  available: true;
  viewer: 'auditor';
  ledgerDerived: true;
  asOfUtc: string;
}
export type MarketResult = MarketResponse | { available: false; viewer: 'auditor'; reason: string };

// Server-side read cache: identical asOfUtc within the window; NOT a job-history
// store — it holds only the last computed auditor view and is recomputed on expiry.
const CACHE_MS = 15_000;
let cache: { at: number; data: MarketResponse } | null = null;

/** Reset the cache (tests / forced refresh). */
export function _clearMarketCache() {
  cache = null;
}

/** The auditor's lawful view of the market, computed live from Canton. Cached ≤15s. */
export async function getMarketOverview(): Promise<MarketResult> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  if (!(await ledgerReachable())) return { available: false, viewer: 'auditor', reason: 'ledger unreachable' };

  try {
    const auditor = await ensureParty('Auditor');

    // Provider roster: resolved parties + safe capability fields from runner health.
    const runners = await fetchRunners();
    const roster: ProviderRoster[] = [];
    for (const p of PROVIDERS) {
      const party = await ensureParty(p.hint);
      const rh = runners.find((r) => r.label === p.label) || null;
      roster.push({
        id: p.id,
        label: p.label,
        party,
        partyShort: shortParty(party),
        servicesAdvertised: rh?.services || [],
        ready: !!rh?.ready,
      });
    }

    // Auditor-visible contracts ONLY. No payload filter → everything the auditor sees.
    const [settleRows, receiptRows] = await Promise.all([
      queryAs(auditor, [T.Settlement]),
      queryAs(auditor, [TW.DeliveryReceipt]),
    ]);

    // Settlement.price is the settlement amount (Accept guarantees paid == price).
    const settlements: RawSettlement[] = settleRows.map((r: any) => ({
      contractId: String(r.contractId),
      providerParty: String(r.payload?.provider ?? ''),
      amount: Number(r.payload?.price ?? 0),
      serviceType: r.payload?.category != null ? String(r.payload.category) : null,
      rfsId: String(r.payload?.rfsId ?? ''),
    }));
    // NOTE: we deliberately read NEITHER Settlement.title NOR any serviceInput — a
    // title can embed the target host, and targets must never appear here.
    const receipts: RawReceipt[] = receiptRows.map((r: any) => ({
      contractId: String(r.contractId),
      providerParty: String(r.payload?.provider ?? ''),
      serviceType: r.payload?.serviceType != null ? String(r.payload.serviceType) : null,
      sha256: String(r.payload?.sha256 ?? ''),
      byteLen: Number(r.payload?.byteLen ?? 0),
      acceptedAtUtc: String(r.payload?.acceptedAt ?? ''),
      settlementCid: r.payload?.settlementCid != null ? String(r.payload.settlementCid) : null,
      rfsId: String(r.payload?.rfsId ?? ''),
    }));

    const readyCount = roster.filter((p) => p.ready).length;
    const servicesLive = new Set(roster.filter((p) => p.ready).flatMap((p) => p.servicesAdvertised)).size;

    const overview = buildMarketOverview(settlements, receipts, roster, {
      capableAgents: { ready: readyCount, total: PROVIDERS.length },
      servicesLive,
    });

    const data: MarketResponse = {
      available: true,
      viewer: 'auditor',
      ledgerDerived: true,
      asOfUtc: new Date().toISOString(),
      ...overview,
    };
    cache = { at: now, data };
    return data;
  } catch (e: any) {
    return { available: false, viewer: 'auditor', reason: String(e?.message || e).slice(0, 160) };
  }
}
