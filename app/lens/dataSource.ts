// Tacit — Ledger Lens SINGLE DATA SEAM.
//
// Today:  getDeal() returns one seeded deal.
// P3:     replace the body of getDeal() with a live read from the Canton
//         JSON Ledger API (server-side). The returned shape — `Deal` — does
//         not change, so nothing in the UI layer needs to change.

import { Deal, Persona } from './types';

const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];

const SEED_DEAL: Deal = {
  id: 'TACIT-DEAL-7F3A',
  existence: {
    value: 'A confidential deal exists on Tacit',
    visibleTo: ['public', ...PARTICIPANTS],
  },
  rfs: {
    title: {
      value: 'Market-intelligence report',
      visibleTo: PARTICIPANTS,
    },
    description: {
      value:
        'Competitive analysis of three named DeFi lending protocols, delivered as a structured report.',
      visibleTo: PARTICIPANTS,
    },
    budget: {
      value: 'Budget < $50',
      visibleTo: PARTICIPANTS,
    },
    buyer: {
      value: 'Acme Research Agent',
      visibleTo: PARTICIPANTS,
    },
  },
  bids: [
    {
      id: 'bid-a',
      provider: 'providerA',
      providerLabel: { value: 'Provider A', visibleTo: PARTICIPANTS },
      amount: { value: 31, visibleTo: ['providerA', 'buyer'] },
      note: { value: 'Premium sources · 24h turnaround', visibleTo: ['providerA', 'buyer'] },
      submittedAt: { value: '09:41:02', visibleTo: PARTICIPANTS },
    },
    {
      id: 'bid-b',
      provider: 'providerB',
      providerLabel: { value: 'Provider B', visibleTo: PARTICIPANTS },
      amount: { value: 42, visibleTo: ['providerB', 'buyer'] },
      note: { value: 'Includes human analyst review', visibleTo: ['providerB', 'buyer'] },
      submittedAt: { value: '09:41:08', visibleTo: PARTICIPANTS },
    },
    {
      id: 'bid-c',
      provider: 'providerC',
      providerLabel: { value: 'Provider C', visibleTo: PARTICIPANTS },
      amount: { value: 28, visibleTo: ['providerC', 'buyer'] },
      note: { value: 'Automated pipeline · lowest cost', visibleTo: ['providerC', 'buyer'] },
      submittedAt: { value: '09:41:05', visibleTo: PARTICIPANTS },
    },
  ],
  settlement: {
    // Static sample shown before a live run — honest, non-ledger copy.
    status: {
      value: 'Sample deal',
      visibleTo: ['public', ...PARTICIPANTS],
    },
    winner: {
      value: 'Provider C',
      visibleTo: ['buyer', 'providerC'],
    },
    amount: {
      value: 28,
      visibleTo: ['buyer', 'providerC'],
    },
    txId: {
      value: '— run live for a contract id',
      visibleTo: ['buyer', 'providerC'],
    },
    commitment: {
      value: 'illustrative · not on ledger',
      visibleTo: ['public', ...PARTICIPANTS],
    },
  },
};

export async function getDeal(): Promise<Deal> {
  // P3: return await readDealFromCanton(dealId)
  return SEED_DEAL;
}
