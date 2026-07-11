// Tacit — settle a negotiation on the live Canton ledger.
//
// Flow: ensure parties (incl. the permissioned Auditor) → buyer creates the Rfs
// (now carrying title/category and the auditor as an optional observer) → each
// provider creates a SealedBid → SNAPSHOT bid + rfs visibility per party WHILE
// active → buyer self-issues a demo Iou → buyer exercises Rfs.Award with the
// paymentCid (ONE atomic tx: reject losers, accept winner, move the Iou, create
// the Settlement, close the RFS) → SNAPSHOT settlement + Iou per party.
//
// Atomicity is the ledger's. Privacy is proven by the per-party snapshots — the
// Auditor is queried like everyone else and, by construction, sees the Rfs and
// Settlement but never a SealedBid or an Iou.
//
// Iou has no rfsId and parties are reused, so we isolate THIS run's transferred
// Iou by diffing the winner's holdings before/after the award.

import { ensureParty, create, exercise, queryAs, T, partyHint } from './client';
import type { NegotiationCore } from '../agents/negotiation';

export interface LedgerRefs {
  written: boolean;
  ledgerRfsId?: string;
  parties?: Record<string, string>;
  contracts?: { rfs: string; bids: string[]; settlement: string; iou: string };
  error?: string;
}

export interface PartyView {
  cid: string;
  provider: string;
  price: number;
}

export interface SettleView extends PartyView {
  title: string;
  category: string;
}

export interface RfsView {
  cid: string;
  title: string;
  category: string;
}

export interface IouView {
  cid: string;
  owner: string;
  amount: number;
  currency: string;
}

export interface LedgerSnapshot {
  rfsId: string;
  parties: Record<string, string>;
  /** persona -> the Rfs it could see (captured BEFORE the award; buyer + auditor). */
  rfsViews: Record<string, RfsView[]>;
  /** persona -> sealed bids that persona could see (captured BEFORE the award). */
  bidViews: Record<string, PartyView[]>;
  /** persona -> settlement(s) that persona can see (captured AFTER the award). */
  settleViews: Record<string, SettleView[]>;
  /** persona -> payment IOUs that persona can see (captured AFTER the award). */
  iouViews: Record<string, IouView[]>;
  settlementCid: string;
  /** The specific Iou moved to the winner in THIS award (owner = winner). */
  paymentIouCid: string;
  paymentAmount: number;
  paymentCurrency: string;
  title: string;
  category: string;
}

// The auditor is queried exactly like every other persona — no special-casing.
const PERSONAS = ['buyer', 'providerA', 'providerB', 'providerC', 'auditor'] as const;

async function snapshotRfs(parties: Record<string, string>, rfsId: string) {
  const out: Record<string, RfsView[]> = {};
  for (const persona of PERSONAS) {
    const rows = await queryAs(parties[persona], [T.Rfs], { rfsId });
    out[persona] = rows.map((c: any) => ({ cid: c.contractId, title: c.payload.title, category: c.payload.category }));
  }
  return out;
}

async function snapshotBids(parties: Record<string, string>, rfsId: string) {
  const out: Record<string, PartyView[]> = {};
  for (const persona of PERSONAS) {
    const rows = await queryAs(parties[persona], [T.SealedBid], { rfsId });
    out[persona] = rows.map((c: any) => ({ cid: c.contractId, provider: c.payload.provider, price: Number(c.payload.price) }));
  }
  return out;
}

async function snapshotSettlement(parties: Record<string, string>, rfsId: string) {
  const out: Record<string, SettleView[]> = {};
  for (const persona of PERSONAS) {
    const rows = await queryAs(parties[persona], [T.Settlement], { rfsId });
    out[persona] = rows.map((c: any) => ({
      cid: c.contractId,
      provider: c.payload.provider,
      price: Number(c.payload.price),
      title: c.payload.title,
      category: c.payload.category,
    }));
  }
  return out;
}

async function snapshotIous(parties: Record<string, string>) {
  const out: Record<string, IouView[]> = {};
  for (const persona of PERSONAS) {
    const rows = await queryAs(parties[persona], [T.Iou], { currency: 'USD.demo' });
    out[persona] = rows.map((c: any) => ({
      cid: c.contractId,
      owner: c.payload.owner,
      amount: Number(c.payload.amount),
      currency: c.payload.currency,
    }));
  }
  return out;
}

export async function settleNegotiation(
  core: NegotiationCore,
  opts: { buyerHint?: string } = {},
): Promise<{ refs: LedgerRefs; snapshot: LedgerSnapshot | null }> {
  try {
    const buyer = await ensureParty(opts.buyerHint ? partyHint(opts.buyerHint) : 'Buyer');
    const providerA = await ensureParty('ProviderA');
    const providerB = await ensureParty('ProviderB');
    const providerC = await ensureParty('ProviderC');
    // A stable, well-known permissioned compliance party for the demo.
    const auditor = await ensureParty('Auditor');
    const parties: Record<string, string> = { buyer, providerA, providerB, providerC, auditor };
    const winnerParty = parties[core.winner.id];

    const rfsId = `RFS-${Date.now().toString(36)}`;

    // The Rfs carries the deal's title/category on-ledger and names the auditor
    // as an optional observer (the auditor may see that this request existed).
    const rfsCid = await create(
      T.Rfs,
      {
        rfsId,
        buyer,
        description: core.rfs.description,
        maxBudget: String(core.rfs.budget),
        title: core.rfs.title,
        category: core.category,
        auditor, // Optional Party → Some auditor
      },
      [buyer],
    );

    const bidCidByProvider: Record<string, string> = {};
    const bidCids: string[] = [];
    for (const b of core.bids) {
      const provider = parties[b.id as string];
      const cid = await create(T.SealedBid, { rfsId, provider, buyer, price: String(b.price) }, [provider]);
      bidCidByProvider[b.id] = cid;
      bidCids.push(cid);
    }

    // Snapshot Rfs + sealed-bid visibility while both are still active.
    const rfsViews = await snapshotRfs(parties, rfsId);
    const bidViews = await snapshotBids(parties, rfsId);

    const currency = 'USD.demo';
    const paymentAmount = core.winner.price;
    const iouCid = await create(T.Iou, { issuer: buyer, owner: buyer, amount: String(paymentAmount), currency }, [buyer]);

    const preWinnerIouCids = new Set((await queryAs(winnerParty, [T.Iou], { currency })).map((c: any) => c.contractId));

    const winnerCid = bidCidByProvider[core.winner.id];
    const loserCids = core.bids.filter((b) => b.id !== core.winner.id).map((b) => bidCidByProvider[b.id]);
    // Award args are UNCHANGED — title/category/auditor flow from the Rfs itself.
    const settlementCid: string = await exercise(
      T.Rfs,
      rfsCid,
      'Award',
      { winningBid: winnerCid, losingBids: loserCids, paymentCid: iouCid },
      [buyer],
    );

    const settleViews = await snapshotSettlement(parties, rfsId);
    const iouViews = await snapshotIous(parties);

    const postWinnerIous = iouViews[core.winner.id] || [];
    const moved = postWinnerIous.find((i) => i.owner === winnerParty && !preWinnerIouCids.has(i.cid));

    return {
      refs: {
        written: true,
        ledgerRfsId: rfsId,
        parties,
        contracts: { rfs: rfsCid, bids: bidCids, settlement: settlementCid, iou: moved?.cid ?? '' },
      },
      snapshot: {
        rfsId,
        parties,
        rfsViews,
        bidViews,
        settleViews,
        iouViews,
        settlementCid,
        paymentIouCid: moved?.cid ?? '',
        paymentAmount: moved?.amount ?? paymentAmount,
        paymentCurrency: moved?.currency ?? currency,
        title: core.rfs.title,
        category: core.category,
      },
    };
  } catch (e: any) {
    return { refs: { written: false, error: String(e?.message || e) }, snapshot: null };
  }
}
