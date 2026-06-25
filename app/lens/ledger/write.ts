// Tacit — settle a negotiation on the live Canton ledger (P2: atomic award).
//
// Flow:
//   1. ensure the 4 parties
//   2. buyer creates the Rfs (now carries rfsId)
//   3. each provider creates a SealedBid
//   4. SNAPSHOT sealed-bid visibility per party — WHILE the bids are active.
//      (This is the privacy proof. The Award below archives the bids, so this
//       snapshot must happen first.)
//   5. buyer exercises Rfs.Award — ONE atomic transaction that rejects the
//      losing bids, accepts the winner (creating the Settlement), and closes the
//      RFS. Returns the real Settlement contract id.
//   6. SNAPSHOT settlement visibility per party — after the award.
//
// Atomicity is the ledger's: the award is a single Daml transaction, not a
// sequence of TS calls. We never create Settlement directly anymore.

import { ensureParty, create, exercise, queryAs, T } from './client';
import type { NegotiationCore } from '../agents/negotiation';

export interface LedgerRefs {
  written: boolean;
  ledgerRfsId?: string;
  parties?: Record<string, string>;
  contracts?: { rfs: string; bids: string[]; settlement: string };
  error?: string;
}

export interface PartyView {
  cid: string;
  provider: string;
  price: number;
}

export interface LedgerSnapshot {
  rfsId: string;
  parties: Record<string, string>;
  /** persona -> sealed bids that persona could see (captured BEFORE the award). */
  bidViews: Record<string, PartyView[]>;
  /** persona -> settlement(s) that persona can see (captured AFTER the award). */
  settleViews: Record<string, PartyView[]>;
  settlementCid: string;
}

const PERSONAS = ['buyer', 'providerA', 'providerB', 'providerC'] as const;

async function snapshot(templateId: string, parties: Record<string, string>, rfsId: string) {
  const out: Record<string, PartyView[]> = {};
  for (const persona of PERSONAS) {
    const rows = await queryAs(parties[persona], [templateId], { rfsId });
    out[persona] = rows.map((c: any) => ({ cid: c.contractId, provider: c.payload.provider, price: Number(c.payload.price) }));
  }
  return out;
}

export async function settleNegotiation(core: NegotiationCore): Promise<{ refs: LedgerRefs; snapshot: LedgerSnapshot | null }> {
  try {
    const buyer = await ensureParty('Buyer');
    const providerA = await ensureParty('ProviderA');
    const providerB = await ensureParty('ProviderB');
    const providerC = await ensureParty('ProviderC');
    const parties: Record<string, string> = { buyer, providerA, providerB, providerC };

    const rfsId = `RFS-${Date.now().toString(36)}`;

    const rfsCid = await create(
      T.Rfs,
      { rfsId, buyer, description: core.rfs.title, maxBudget: String(core.rfs.budget) },
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

    // Snapshot sealed-bid visibility while the bids are still active.
    const bidViews = await snapshot(T.SealedBid, parties, rfsId);

    // Atomic award: reject losers + accept winner (creates Settlement) + close RFS.
    const winnerCid = bidCidByProvider[core.winner.id];
    const loserCids = core.bids.filter((b) => b.id !== core.winner.id).map((b) => bidCidByProvider[b.id]);
    const settlementCid: string = await exercise(
      T.Rfs,
      rfsCid,
      'Award',
      { winningBid: winnerCid, losingBids: loserCids },
      [buyer],
    );

    const settleViews = await snapshot(T.Settlement, parties, rfsId);

    return {
      refs: { written: true, ledgerRfsId: rfsId, parties, contracts: { rfs: rfsCid, bids: bidCids, settlement: settlementCid } },
      snapshot: { rfsId, parties, bidViews, settleViews, settlementCid },
    };
  } catch (e: any) {
    return { refs: { written: false, error: String(e?.message || e) }, snapshot: null };
  }
}
