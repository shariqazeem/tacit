// Tacit — assemble the Lens deal from per-party ledger snapshots (P3.2 + P2).
//
// The Lens does not ASSERT who-sees-what; it REFLECTS the ledger. `write.ts`
// captured, per party, exactly which sealed bids each party could query (before
// the atomic award) and which settlement each can see (after). Here we turn
// those snapshots into the Field-wrapped Deal: each price's `visibleTo` is the
// set of personas whose query actually returned it, and the settlement carries
// the real Canton contract id.
//
// Participant-visible metadata (RFS text, provider labels, timestamps) and the
// public-framing fields come from the negotiation core — "public" is not a
// ledger party, so those are not queries.

import { Deal, Bid, Persona } from '../types';
import type { NegotiationCore } from '../agents/negotiation';
import type { LedgerSnapshot } from './write';

const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];

export function buildLedgerDeal(core: NegotiationCore, snap: LedgerSnapshot): Deal {
  const reverse: Record<string, Persona> = {};
  for (const p of PARTICIPANTS) reverse[snap.parties[p]] = p;

  // Pre-award bid snapshot: who saw each bid contract, and its price.
  const seenBy: Record<string, Set<Persona>> = {};
  const bidByProvider: Record<string, { cid: string; price: number }> = {};
  for (const persona of PARTICIPANTS) {
    for (const v of snap.bidViews[persona] || []) {
      (seenBy[v.cid] ||= new Set()).add(persona);
      const prov = reverse[v.provider];
      if (prov) bidByProvider[prov] = { cid: v.cid, price: v.price };
    }
  }

  // Post-award settlement snapshot.
  const settleSeen = new Set<Persona>();
  let settlePrice: number | null = null;
  let settleProvider: Persona | null = null;
  for (const persona of PARTICIPANTS) {
    for (const v of snap.settleViews[persona] || []) {
      settleSeen.add(persona);
      settlePrice = v.price;
      settleProvider = reverse[v.provider] ?? settleProvider;
    }
  }

  const dealBids: Bid[] = core.bids.map((b) => {
    const led = bidByProvider[b.id];
    const vis = (led && seenBy[led.cid] ? [...seenBy[led.cid]] : ([b.id, 'buyer'] as Persona[])).sort() as Persona[];
    return {
      id: `bid-${b.id}`,
      provider: b.id,
      providerLabel: { value: b.label, visibleTo: PARTICIPANTS },
      amount: { value: led ? led.price : b.price, visibleTo: vis }, // ← visibility derived from the ledger
      note: { value: b.note, visibleTo: vis },
      submittedAt: { value: b.at, visibleTo: PARTICIPANTS },
    };
  });

  const winnerPersona: Persona = settleProvider ?? core.winner.id;
  const winnerLabel = core.bids.find((b) => b.id === winnerPersona)?.label ?? core.winner.label;
  const winnerObservers: Persona[] = settleSeen.size ? ([...settleSeen].sort() as Persona[]) : ['buyer', winnerPersona];
  const cid = snap.settlementCid;
  const txDisplay = cid ? `${cid.slice(0, 10)}…${cid.slice(-6)}` : '—';

  return {
    id: 'TACIT-DEAL-' + snap.rfsId.replace(/^RFS-/, '').toUpperCase().slice(0, 6),
    existence: { value: 'A confidential deal exists on Tacit', visibleTo: ['public', ...PARTICIPANTS] },
    rfs: {
      title: { value: core.rfs.title, visibleTo: PARTICIPANTS },
      description: { value: core.rfs.description, visibleTo: PARTICIPANTS },
      budget: { value: `Budget < $${core.rfs.budget}`, visibleTo: PARTICIPANTS },
      buyer: { value: 'Acme Research Agent', visibleTo: PARTICIPANTS },
    },
    bids: dealBids,
    settlement: {
      // Honest: the award executed atomically on Canton (losers archived,
      // settlement created, RFS closed in one transaction). No token movement yet.
      status: { value: 'Awarded on Canton', visibleTo: ['public', ...PARTICIPANTS] },
      winner: { value: winnerLabel, visibleTo: winnerObservers },
      amount: { value: settlePrice ?? core.winner.price, visibleTo: winnerObservers },
      txId: { value: txDisplay, visibleTo: winnerObservers }, // ← real Canton Settlement contract id
      commitment: { value: 'tx committed · contents private', visibleTo: ['public', ...PARTICIPANTS] },
    },
  };
}
