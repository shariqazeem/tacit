// Tacit — read a deal back from the live Canton ledger, per party.
//
// The point of P3.2: the Lens stops ASSERTING who-sees-what and starts
// REFLECTING the ledger. We query the SealedBids AS each persona and set each
// price's `visibleTo` to exactly the set of personas whose query actually
// returned that contract — so the privacy you see in the Lens is the ledger's,
// not ours. The real Settlement contract id is surfaced as the "Canton
// transaction".
//
// Participant-visible metadata (RFS text, provider labels, timestamps) and the
// public-framing fields (existence/status/commitment) are kept from the
// negotiation core — "public" is not a ledger party, so those aren't queries.

import { Deal, Bid, Persona } from '../types';
import { queryAs, T } from './client';
import type { NegotiationCore } from '../agents/negotiation';

const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];

export async function readDealFromLedger(
  rfsId: string,
  parties: Record<string, string>,
  core: NegotiationCore,
): Promise<Deal> {
  const reverse: Record<string, Persona> = {};
  for (const p of PARTICIPANTS) reverse[parties[p]] = p;

  // Who can actually see each SealedBid contract? (ledger-enforced)
  const seenBy: Record<string, Set<Persona>> = {};
  const bidByProvider: Record<string, { cid: string; price: number }> = {};
  for (const persona of PARTICIPANTS) {
    const rows = await queryAs(parties[persona], [T.SealedBid], { rfsId });
    for (const c of rows) {
      (seenBy[c.contractId] ||= new Set()).add(persona);
      const prov = reverse[c.payload.provider];
      if (prov) bidByProvider[prov] = { cid: c.contractId, price: Number(c.payload.price) };
    }
  }

  // Who can see the Settlement, and its real contract id?
  const settleSeen = new Set<Persona>();
  let settlePrice: number | null = null;
  let settleProvider: Persona | null = null;
  let settleCid = '';
  for (const persona of PARTICIPANTS) {
    const rows = await queryAs(parties[persona], [T.Settlement], { rfsId });
    for (const c of rows) {
      settleSeen.add(persona);
      settlePrice = Number(c.payload.price);
      settleProvider = reverse[c.payload.provider] ?? settleProvider;
      settleCid = c.contractId;
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
  const txDisplay = settleCid ? `${settleCid.slice(0, 10)}…${settleCid.slice(-6)}` : '—';

  return {
    id: 'TACIT-DEAL-' + rfsId.replace(/^RFS-/, '').toUpperCase().slice(0, 6),
    existence: { value: 'A confidential deal exists on Tacit', visibleTo: ['public', ...PARTICIPANTS] },
    rfs: {
      title: { value: core.rfs.title, visibleTo: PARTICIPANTS },
      description: { value: core.rfs.description, visibleTo: PARTICIPANTS },
      budget: { value: `Budget < $${core.rfs.budget}`, visibleTo: PARTICIPANTS },
      buyer: { value: 'Acme Research Agent', visibleTo: PARTICIPANTS },
    },
    bids: dealBids,
    settlement: {
      status: { value: 'Settled atomically', visibleTo: ['public', ...PARTICIPANTS] },
      winner: { value: winnerLabel, visibleTo: winnerObservers },
      amount: { value: settlePrice ?? core.winner.price, visibleTo: winnerObservers },
      txId: { value: txDisplay, visibleTo: winnerObservers }, // ← real Canton Settlement contract id
      commitment: { value: 'tx committed · contents private', visibleTo: ['public', ...PARTICIPANTS] },
    },
  };
}
