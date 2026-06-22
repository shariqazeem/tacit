// Tacit — autonomous agent negotiation engine.
//
// `negotiateCore` runs the agents and returns the RAW outcome (real prices +
// personas + transcript). `buildDealFromCore` turns that into the Field-wrapped
// `Deal` the Lens renders. The ledger writer (app/lens/ledger/write.ts) consumes
// the core directly, so it has real values to persist on Canton.
//
// Provider prices come from an LLM when a key is configured; otherwise a
// deterministic, persona-based fallback keeps the demo reliable and repeatable.

import { Deal, Bid, Persona } from '../types';
import { llmJson, llmAvailable } from './llm';

export interface Step {
  actor: string;
  action: string;
  detail: string;
  t: string;
}

export interface Rfs {
  title: string;
  description: string;
  budget: number;
}

export interface BidResult {
  id: Persona; // providerA | providerB | providerC
  label: string;
  price: number;
  note: string;
  at: string;
}

export interface NegotiationCore {
  rfs: Rfs;
  bids: BidResult[];
  winner: BidResult;
  transcript: Step[];
  usedLLM: boolean;
}

export interface NegotiationResult {
  transcript: Step[];
  deal: Deal;
  usedLLM: boolean;
}

interface ProviderProfile {
  id: Persona;
  label: string;
  blurb: string;
  /** Fallback price = round(budget * mult). Chosen so budget $50 -> 31 / 42 / 28. */
  mult: number;
}

const PROVIDERS: ProviderProfile[] = [
  { id: 'providerA', label: 'Provider A', blurb: 'Premium sources · 24h turnaround', mult: 0.62 },
  { id: 'providerB', label: 'Provider B', blurb: 'Includes human analyst review', mult: 0.84 },
  { id: 'providerC', label: 'Provider C', blurb: 'Automated pipeline · lowest cost', mult: 0.56 },
];

const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];

async function providerAgent(rfs: Rfs, p: ProviderProfile): Promise<{ price: number; note: string; source: 'llm' | 'fallback' }> {
  const system =
    `You are ${p.label}, an autonomous service-provider agent on a sealed-bid marketplace. ` +
    `You can see ONLY the buyer's request, never any competitor's bid. ` +
    `Respond with ONLY compact JSON: {"price": <integer dollars>, "note": "<max 60 chars>"}.`;
  const user =
    `Request: "${rfs.title}" — ${rfs.description} Buyer budget: $${rfs.budget}. ` +
    `Your cost profile: ${p.blurb}. Bid a price (integer, <= budget) and a one-line rationale.`;

  const out = await llmJson(system, user);
  if (out && typeof out.price === 'number' && isFinite(out.price)) {
    const price = Math.max(1, Math.min(Math.round(out.price), rfs.budget));
    const note = typeof out.note === 'string' && out.note.trim() ? out.note.trim().slice(0, 60) : p.blurb;
    return { price, note, source: 'llm' };
  }
  return { price: Math.max(1, Math.round(rfs.budget * p.mult)), note: p.blurb, source: 'fallback' };
}

/** Run the agents; return the raw outcome + transcript (no Field wrapping, no ledger). */
export async function negotiateCore(opts: { intent?: string; description?: string; budget?: number } = {}): Promise<NegotiationCore> {
  const title = opts.intent?.trim() || 'Market-intelligence report';
  const description =
    opts.description?.trim() ||
    'Competitive analysis of three named DeFi lending protocols, delivered as a structured report.';
  const budget = opts.budget && opts.budget > 0 ? Math.round(opts.budget) : 50;
  const rfs: Rfs = { title, description, budget };

  const clock = makeClock(9, 41, 0);
  const transcript: Step[] = [];
  transcript.push({ actor: 'Buyer Agent', action: 'Posted request', detail: `${title} · budget < $${budget}`, t: clock() });

  const raw = await Promise.all(PROVIDERS.map(async (p) => ({ profile: p, ...(await providerAgent(rfs, p)) })));
  const bids: BidResult[] = raw.map((b) => {
    const at = clock();
    transcript.push({ actor: b.profile.label, action: 'Submitted sealed bid', detail: 'Encrypted to the buyer only', t: at });
    return { id: b.profile.id, label: b.profile.label, price: b.price, note: b.note, at };
  });

  transcript.push({ actor: 'Buyer Agent', action: 'Compared bids', detail: `${bids.length} sealed bids received`, t: clock() });
  const winner = bids.reduce((best, b) => (b.price < best.price ? b : best), bids[0]);
  transcript.push({ actor: 'Buyer Agent', action: 'Awarded deal', detail: `${winner.label} selected`, t: clock() });
  transcript.push({ actor: 'Tacit', action: 'Settled atomically', detail: 'Payment + delivery in one Canton transaction', t: clock() });

  return { rfs, bids, winner, transcript, usedLLM: raw.some((b) => b.source === 'llm') && llmAvailable() };
}

/** Turn a raw negotiation into the Field-wrapped Deal the Lens renders. */
export function buildDealFromCore(core: NegotiationCore): Deal {
  const { rfs, bids, winner } = core;
  const dealBids: Bid[] = bids.map((b) => ({
    id: `bid-${b.id}`,
    provider: b.id,
    providerLabel: { value: b.label, visibleTo: PARTICIPANTS },
    amount: { value: b.price, visibleTo: [b.id, 'buyer'] }, // sealed: bidder + buyer only
    note: { value: b.note, visibleTo: [b.id, 'buyer'] },
    submittedAt: { value: b.at, visibleTo: PARTICIPANTS },
  }));
  const winnerObservers: Persona[] = ['buyer', winner.id];

  return {
    id: 'TACIT-DEAL-' + shortId(rfs.title + rfs.budget),
    existence: { value: 'A confidential deal exists on Tacit', visibleTo: ['public', ...PARTICIPANTS] },
    rfs: {
      title: { value: rfs.title, visibleTo: PARTICIPANTS },
      description: { value: rfs.description, visibleTo: PARTICIPANTS },
      budget: { value: `Budget < $${rfs.budget}`, visibleTo: PARTICIPANTS },
      buyer: { value: 'Acme Research Agent', visibleTo: PARTICIPANTS },
    },
    bids: dealBids,
    settlement: {
      status: { value: 'Settled atomically', visibleTo: ['public', ...PARTICIPANTS] },
      winner: { value: winner.label, visibleTo: winnerObservers },
      amount: { value: winner.price, visibleTo: winnerObservers },
      txId: { value: '0x9f3a…c41e', visibleTo: winnerObservers }, // P3.2: real Daml tx / contract id
      commitment: { value: 'tx committed · contents private', visibleTo: ['public', ...PARTICIPANTS] },
    },
  };
}

export async function runNegotiation(opts: { intent?: string; description?: string; budget?: number } = {}): Promise<NegotiationResult> {
  const core = await negotiateCore(opts);
  return { transcript: core.transcript, deal: buildDealFromCore(core), usedLLM: core.usedLLM };
}

/** Deterministic synthetic clock -> "HH:MM:SS", +3s per call. Keeps the transcript repeatable. */
function makeClock(h: number, m: number, s: number): () => string {
  let first = true;
  return () => {
    if (!first) s += 3;
    first = false;
    if (s >= 60) { m += Math.floor(s / 60); s %= 60; }
    if (m >= 60) { h += Math.floor(m / 60); m %= 60; }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };
}

/** Tiny deterministic id (djb2) so a given request always yields the same display id. */
function shortId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
}
