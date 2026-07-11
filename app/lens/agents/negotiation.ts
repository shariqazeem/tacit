// Tacit — autonomous agent negotiation engine.
//
// `negotiateCore` runs the agents and returns the RAW outcome (real prices +
// personas + transcript). `buildDealFromCore` turns that into the Field-wrapped
// `Deal` the Lens renders. The ledger writer (app/lens/ledger/write.ts) consumes
// the core directly, so it has real values to persist on Canton.
//
// Each provider genuinely reasons about price when an LLM key is configured:
// it gets ONE structured call with its OWN private cost profile (profiles.ts)
// for the inferred service category, plus its ledger balance (won/earned) — and
// never a competitor's numbers. Prices are clamped to a sane band and, on any
// parse/timeout/error, that provider falls back to its deterministic multiplier
// silently, so the demo never hangs. With no key, every provider uses the
// LOCKED deterministic multiplier — identical to before.
//
// TRANSCRIPT PRIVACY: the public transcript carries only number-free flavor
// lines; a provider's price appears ONLY in its sealed bid data, never in prose.

import { Deal, Bid, Persona } from '../types';
import { llmJson, llmAvailable } from './llm';
import { PROFILES, inferCategory, type Category, type ProviderProfile } from './profiles';

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

/** A provider's accumulated ledger position — feeds balance-aware bidding. */
export interface Balance {
  earnings: number;
  deals: number;
}

export interface NegotiationCore {
  rfs: Rfs;
  category: Category;
  buyerName: string;
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

const PARTICIPANTS: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC'];
const DEFAULT_BUYER = 'Acme Research Agent';

/** Strip $-amounts, bare numbers and percentages so flavor text can never leak a price. */
function sanitizeFlavor(s: string): string {
  return s
    .replace(/\$\s?\d[\d,.]*/g, '')
    .replace(/\b\d+(?:\.\d+)?%?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
    .slice(0, 140);
}

interface BidOutcome {
  price: number;
  /** Sealed rationale (bidder + buyer only). */
  note: string;
  /** Public, number-free flavor line for the transcript. */
  flavor: string;
  source: 'llm' | 'fallback';
}

async function providerAgent(rfs: Rfs, p: ProviderProfile, category: Category, balance?: Balance): Promise<BidOutcome> {
  const fallbackPrice = Math.max(1, Math.round(rfs.budget * p.mult)); // LOCKED deterministic bid
  const fallback: BidOutcome = { price: fallbackPrice, note: p.blurb, flavor: p.personality, source: 'fallback' };

  if (!llmAvailable()) return fallback;

  const base = p.cost[category];
  const balanceLine = balance
    ? balance.deals >= 3
      ? `You have already won ${balance.deals} deals on this ledger — you can afford to protect your margin.`
      : balance.deals === 0
        ? `You have won nothing yet — bid lean to break in.`
        : `You have won ${balance.deals} deal(s) so far — stay competitive.`
    : '';

  const system =
    `You are ${p.label}, an autonomous service provider on a SEALED-BID marketplace. ` +
    `You see ONLY the buyer's request and your OWN private cost — never a competitor's bid or cost. ` +
    `You win only if you are the LOWEST sealed bid, so bid competitively, but never below your cost. ` +
    `Respond with ONLY compact JSON: {"price": <number>, "rationale": "<why you can serve this, <=140 chars, NO dollar amounts or numbers>"}.`;
  const user =
    `Service category: ${category}. Request: "${rfs.title}" — ${rfs.description} Buyer budget: $${rfs.budget}. ` +
    `PRIVATE: your base cost for this category is about $${base}; your margin policy is ${p.margin.policy} ` +
    `(aim roughly ${Math.round(p.margin.markup * 100)}% over cost). ${balanceLine} ` +
    `Choose one price (>= your cost, <= the budget) and a one-line rationale that mentions NO numbers.`;

  const out = await llmJson(system, user);
  if (out && typeof out.price === 'number' && isFinite(out.price)) {
    // Clamp to (0.3×budget … 0.98×budget], 2 decimals.
    const clamped = Math.min(Math.max(out.price, rfs.budget * 0.3), rfs.budget * 0.98);
    const price = Math.round(clamped * 100) / 100;
    const rationale = sanitizeFlavor(typeof out.rationale === 'string' ? out.rationale : '') || p.personality;
    return { price, note: rationale, flavor: rationale, source: 'llm' };
  }
  return fallback;
}

/** Run the agents; return the raw outcome + transcript (no Field wrapping, no ledger). */
export async function negotiateCore(
  opts: { intent?: string; description?: string; budget?: number; buyerName?: string; balances?: Record<string, Balance> } = {},
): Promise<NegotiationCore> {
  const title = opts.intent?.trim() || 'Market-intelligence report';
  const description =
    opts.description?.trim() ||
    'Competitive analysis of three named DeFi lending protocols, delivered as a structured report.';
  const budget = opts.budget && opts.budget > 0 ? Math.round(opts.budget) : 50;
  const buyerName = opts.buyerName?.trim() || DEFAULT_BUYER;
  const rfs: Rfs = { title, description, budget };
  const category = inferCategory(`${title} ${description}`);

  const clock = makeClock(9, 41, 0);
  const transcript: Step[] = [];
  transcript.push({ actor: 'Buyer Agent', action: 'Posted request', detail: `${title} · budget < $${budget}`, t: clock() });

  // Each provider reasons in parallel (hard-timeout inside llmJson keeps latency ≤ ~8s).
  const raw = await Promise.all(
    PROFILES.map(async (p) => ({ profile: p, ...(await providerAgent(rfs, p, category, opts.balances?.[p.id])) })),
  );

  const bids: BidResult[] = raw.map((b) => {
    // Public flavor FIRST (number-free), then the sealed bid — the price never
    // appears in the transcript, only in the sealed data below.
    transcript.push({ actor: b.profile.label, action: b.flavor, detail: 'reviewing the request', t: clock() });
    const at = clock();
    transcript.push({ actor: b.profile.label, action: 'Submitted sealed bid', detail: 'price sealed to the buyer', t: at });
    return { id: b.profile.id, label: b.profile.label, price: b.price, note: b.note, at };
  });

  transcript.push({ actor: 'Buyer Agent', action: 'Compared bids', detail: `${bids.length} sealed bids received`, t: clock() });
  const winner = bids.reduce((best, b) => (b.price < best.price ? b : best), bids[0]);
  transcript.push({ actor: 'Buyer Agent', action: 'Awarded deal', detail: `${winner.label} selected`, t: clock() });
  transcript.push({ actor: 'Tacit', action: 'Deal awarded', detail: 'Lowest sealed bid selected', t: clock() });

  return {
    rfs,
    category,
    buyerName,
    bids,
    winner,
    transcript,
    usedLLM: raw.some((b) => b.source === 'llm') && llmAvailable(),
  };
}

/** Turn a raw negotiation into the Field-wrapped Deal the Lens renders. */
export function buildDealFromCore(core: NegotiationCore): Deal {
  const { rfs, bids, winner, buyerName } = core;
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
      buyer: { value: buyerName, visibleTo: PARTICIPANTS },
    },
    bids: dealBids,
    settlement: {
      // In-memory fallback (ledger unreachable) — honest, non-ledger copy. NO
      // `payment` field: nothing moved, so the UI must never show VALUE TRANSFERRED.
      status: { value: 'Simulated award', visibleTo: ['public', ...PARTICIPANTS] },
      winner: { value: winner.label, visibleTo: winnerObservers },
      amount: { value: winner.price, visibleTo: winnerObservers },
      txId: { value: 'ledger offline', visibleTo: winnerObservers },
      commitment: { value: 'deterministic simulation · no value moves', visibleTo: ['public', ...PARTICIPANTS] },
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
