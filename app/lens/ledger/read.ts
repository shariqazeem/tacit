// Tacit — assemble the Lens deal from per-party ledger snapshots.
//
// The Lens does not ASSERT who-sees-what; it REFLECTS the ledger. `write.ts`
// captured, per party (including the permissioned Auditor), exactly which Rfs /
// sealed bids / settlement / IOU each party could query. Here we turn those
// snapshots into the Field-wrapped Deal: every `visibleTo` is the set of
// personas whose query actually returned the contract — no special-casing.
//
// The AUDITOR falls straight out of this: it saw the Rfs and the Settlement, so
// it sees the request + the settlement (winner, price, paid); it never saw a
// SealedBid or the Iou, so those stay frosted. Compliance without surveillance.

import { Deal, Bid, Persona } from '../types';
import type { NegotiationCore } from '../agents/negotiation';
import type { LedgerSnapshot } from './write';

// Providers see the request text by convention (they received it to bid). The
// auditor's request/settlement visibility is derived from real ledger queries.
const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];
const ALL: Persona[] = [...PARTICIPANTS, 'auditor'];

export function buildLedgerDeal(core: NegotiationCore, snap: LedgerSnapshot): Deal {
  const reverse: Record<string, Persona> = {};
  for (const p of ALL) reverse[snap.parties[p]] = p;

  // Pre-award: who saw the Rfs (buyer + auditor), and who saw each bid.
  const rfsSeen = new Set<Persona>();
  for (const persona of ALL) if ((snap.rfsViews?.[persona] || []).length) rfsSeen.add(persona);

  const seenBy: Record<string, Set<Persona>> = {};
  const bidByProvider: Record<string, { cid: string; price: number }> = {};
  for (const persona of ALL) {
    for (const v of snap.bidViews[persona] || []) {
      (seenBy[v.cid] ||= new Set()).add(persona);
      const prov = reverse[v.provider];
      if (prov) bidByProvider[prov] = { cid: v.cid, price: v.price };
    }
  }

  // Post-award: who saw the Settlement (buyer + winner + auditor).
  const settleSeen = new Set<Persona>();
  let settlePrice: number | null = null;
  let settleProvider: Persona | null = null;
  for (const persona of ALL) {
    for (const v of snap.settleViews[persona] || []) {
      settleSeen.add(persona);
      settlePrice = v.price;
      settleProvider = reverse[v.provider] ?? settleProvider;
    }
  }

  // Who saw the transferred IOU (buyer + winner ONLY — never the auditor).
  const iouSeen = new Set<Persona>();
  for (const persona of ALL) {
    if ((snap.iouViews?.[persona] || []).some((i) => i.cid === snap.paymentIouCid)) iouSeen.add(persona);
  }

  const winnerPersona: Persona = settleProvider ?? core.winner.id;
  const winnerLabel = core.bids.find((b) => b.id === winnerPersona)?.label ?? core.winner.label;
  const settlementObservers: Persona[] = settleSeen.size ? ([...settleSeen].sort() as Persona[]) : ['buyer', winnerPersona];
  const iouObservers: Persona[] = (iouSeen.size ? [...iouSeen] : (['buyer', winnerPersona] as Persona[])).sort() as Persona[];

  // Request text: providers by convention + the auditor iff it observed the Rfs.
  const rfsVisibleTo: Persona[] = rfsSeen.has('auditor') ? [...PARTICIPANTS, 'auditor'] : [...PARTICIPANTS];
  // Public-safe fields: public + participants + the auditor iff involved.
  const auditorInvolved = rfsSeen.has('auditor') || settleSeen.has('auditor');
  const publicVisibleTo: Persona[] = auditorInvolved ? ['public', ...PARTICIPANTS, 'auditor'] : ['public', ...PARTICIPANTS];

  // On-ledger title/category (read from the settlement/rfs the ledger returned).
  const onLedgerTitle = snap.settleViews['buyer']?.[0]?.title ?? snap.title ?? core.rfs.title;

  const dealBids: Bid[] = core.bids.map((b) => {
    const led = bidByProvider[b.id];
    const vis = (led && seenBy[led.cid] ? [...seenBy[led.cid]] : ([b.id, 'buyer'] as Persona[])).sort() as Persona[];
    return {
      id: `bid-${b.id}`,
      provider: b.id,
      // ALL bid fields exclude the auditor — it never observed a SealedBid, so
      // its entire Sealed Bids card is frosted (bidder, price, time).
      providerLabel: { value: b.label, visibleTo: PARTICIPANTS },
      amount: { value: led ? led.price : b.price, visibleTo: vis }, // ← from the ledger; auditor is never here
      note: { value: b.note, visibleTo: vis },
      submittedAt: { value: b.at, visibleTo: PARTICIPANTS },
    };
  });

  const cid = snap.settlementCid;
  const hasPayment = !!snap.paymentIouCid;

  // Payment. The paid AMOUNT lives on the Settlement → visible to its observers
  // (buyer + winner + auditor). The IOU CONTRACT id is only knowable to the
  // IOU's stakeholders (buyer + winner) → frosted for the auditor.
  const payment = hasPayment
    ? {
        amount: { value: snap.paymentAmount, visibleTo: settlementObservers },
        currency: { value: snap.paymentCurrency, visibleTo: settlementObservers },
        iouContractId: { value: snap.paymentIouCid, visibleTo: iouObservers },
      }
    : undefined;

  return {
    id: 'TACIT-DEAL-' + snap.rfsId.replace(/^RFS-/, '').toUpperCase().slice(0, 6),
    // Real on-network party ids per persona (proof these aren't app labels).
    parties: snap.parties as Partial<Record<Persona, string>>,
    existence: { value: 'A confidential deal exists on Tacit', visibleTo: publicVisibleTo },
    rfs: {
      title: { value: onLedgerTitle, visibleTo: rfsVisibleTo },
      description: { value: core.rfs.description, visibleTo: rfsVisibleTo },
      budget: { value: `Budget < $${core.rfs.budget}`, visibleTo: rfsVisibleTo },
      buyer: { value: core.buyerName, visibleTo: rfsVisibleTo },
    },
    bids: dealBids,
    settlement: {
      status: { value: hasPayment ? 'Awarded & paid on Canton' : 'Awarded on Canton', visibleTo: publicVisibleTo },
      winner: { value: winnerLabel, visibleTo: settlementObservers },
      amount: { value: settlePrice ?? core.winner.price, visibleTo: settlementObservers },
      txId: { value: cid || '—', visibleTo: settlementObservers }, // FULL Canton Settlement contract id (UI truncates; copy = full)
      commitment: { value: 'tx committed · contents private', visibleTo: publicVisibleTo },
      ...(payment ? { payment } : {}),
    },
  };
}
