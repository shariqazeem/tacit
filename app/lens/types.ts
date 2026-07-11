// Tacit — Ledger Lens data model.
//
// Every piece of deal data is wrapped in a `Field` carrying `visibleTo`, so
// visibility is 100% data-driven. The UI NEVER hardcodes who-sees-what — it
// only reads `visibleTo`. This mirrors Canton/Daml's signatory/observer model.
//
// SWAP SEAM (P3): this model is the contract between the UI and the data
// source. Today it is populated by seeded data in ./dataSource; later the same
// shape is populated from live Canton JSON Ledger API reads. The component
// layer does not change.
//
// G12 (future personas): `Persona` is a string union plus a PERSONAS registry.
// Adding an "auditor" / "regulator" / "compliance" viewer later is PURELY
// additive — extend the union, add a registry entry, and list that persona in
// the relevant `visibleTo` arrays. No Field / Deal / component changes needed.

export type Persona =
  | 'public'
  | 'buyer'
  | 'providerA'
  | 'providerB'
  | 'providerC'
  | 'auditor';

export interface PersonaMeta {
  id: Persona;
  label: string; // shown in the switcher
  role: string; // one-line role descriptor
  /** Narration shown when this persona is active — ties the view to Canton. */
  caption: string;
}

/** A single value plus the exact set of personas allowed to see it. */
export interface Field<T = string> {
  value: T;
  visibleTo: Persona[];
}

export interface Bid {
  id: string;
  provider: Persona;
  /** That this provider submitted a bid — visible to participants, not public. */
  providerLabel: Field<string>;
  /** The sealed price — visible ONLY to the bidder and the buyer. */
  amount: Field<number>;
  /** The bidder's private rationale — sealed like the price. */
  note: Field<string>;
  /** Submission time — visible to participants. */
  submittedAt: Field<string>;
}

export interface Deal {
  id: string;
  /**
   * Ledger-derived full party ids per persona (`Name::fingerprint`) — present
   * ONLY on ON-CANTON deals. Surfaced in the Lens as proof these are real
   * on-network parties, not app labels. Absent on the memory fallback.
   */
  parties?: Partial<Record<Persona, string>>;
  /** Public-safe existence marker — confirms a deal exists without its contents. */
  existence: Field<string>;
  rfs: {
    title: Field<string>;
    description: Field<string>;
    budget: Field<string>;
    buyer: Field<string>;
  };
  bids: Bid[];
  settlement: {
    status: Field<string>;
    winner: Field<string>;
    amount: Field<number>;
    /** Canton ledger transaction id. At P3 this becomes the real Daml tx hash. */
    txId: Field<string>;
    /** Public commitment — the network confirms a tx occurred, not its contents. */
    commitment: Field<string>;
    /**
     * P2.1 — value that moved INSIDE the atomic award (a demo IOU transfer).
     * Additive + optional: present ONLY on live-ledger deals. The memory fallback
     * omits it entirely, so the UI never claims value moved when it didn't.
     * `visibleTo` (buyer + winner only) is derived from the ledger Iou snapshot.
     */
    payment?: {
      amount: Field<number>;
      currency: Field<string>;
      iouContractId: Field<string>;
    };
  };
}

export const PERSONAS: PersonaMeta[] = [
  {
    id: 'public',
    label: 'Public',
    role: 'The Canton network',
    caption:
      'You are the public network. You can confirm a confidential deal exists and that it settled — but its contents, parties, and prices stay private.',
  },
  {
    id: 'buyer',
    label: 'Buyer Agent',
    role: 'Requested the service',
    caption:
      'You are the Buyer. As the observer on every sealed bid, you alone can compare all prices and award the deal.',
  },
  {
    id: 'providerA',
    label: 'Provider A',
    role: 'Submitted a sealed bid',
    caption:
      'You are Provider A. You see your own sealed bid, but Canton hides every competitor’s price from you — sealed-bid integrity by construction.',
  },
  {
    id: 'providerB',
    label: 'Provider B',
    role: 'Submitted a sealed bid',
    caption:
      'You are Provider B. You see your own sealed bid; competitors’ prices are invisible to you.',
  },
  {
    id: 'providerC',
    label: 'Provider C',
    role: 'Submitted the winning bid',
    caption:
      'You are Provider C — you won. You see your own bid and the settlement, yet you never saw a single competitor’s price.',
  },
  {
    id: 'auditor',
    label: 'Auditor',
    role: 'Permissioned compliance',
    caption:
      'You are the Auditor — permissioned oversight. You can verify every settlement (winner, price, amount paid) but Canton never returns a single sealed bid to you. Compliance without surveillance.',
  },
];

/** The ONLY visibility primitive. Pure function of the field's observer set. */
export function isVisible<T>(field: Field<T>, persona: Persona): boolean {
  return field.visibleTo.includes(persona);
}
