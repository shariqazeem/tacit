// Tacit — persist a negotiation outcome to the live Canton ledger.
//
// Writes the real contracts: one Rfs (buyer), three SealedBid (each provider,
// observer = buyer only), and a Settlement (buyer + winning provider as
// co-signatories). The sealed-bid privacy is then enforced by the ledger
// itself, exactly as proven over HTTP in P3.0.

import { ensureParty, create, T } from './client';
import type { NegotiationCore } from '../agents/negotiation';

export interface LedgerRefs {
  written: boolean;
  ledgerRfsId?: string;
  parties?: Record<string, string>;
  contracts?: { rfs: string; bids: string[]; settlement: string };
  error?: string;
}

export async function writeNegotiation(core: NegotiationCore): Promise<LedgerRefs> {
  try {
    const buyer = await ensureParty('Buyer');
    const providerA = await ensureParty('ProviderA');
    const providerB = await ensureParty('ProviderB');
    const providerC = await ensureParty('ProviderC');
    const partyOf: Record<string, string> = { buyer, providerA, providerB, providerC };

    // Unique per run so a given deal's contracts can be read back as a group (P3.2).
    const ledgerRfsId = `RFS-${Date.now().toString(36)}`;

    const rfs = await create(T.Rfs, { buyer, description: core.rfs.title, maxBudget: String(core.rfs.budget) }, [buyer]);

    const bids: string[] = [];
    for (const b of core.bids) {
      const provider = partyOf[b.id as string];
      const cid = await create(
        T.SealedBid,
        { rfsId: ledgerRfsId, provider, buyer, price: String(b.price) },
        [provider], // signed by the provider; buyer is observer via the template
      );
      bids.push(cid);
    }

    const winnerParty = partyOf[core.winner.id as string];
    const settlement = await create(
      T.Settlement,
      { buyer, provider: winnerParty, rfsId: ledgerRfsId, price: String(core.winner.price) },
      [buyer, winnerParty], // dual-signatory: submit acting as both
    );

    return { written: true, ledgerRfsId, parties: partyOf, contracts: { rfs, bids, settlement } };
  } catch (e: any) {
    return { written: false, error: String(e?.message || e) };
  }
}
