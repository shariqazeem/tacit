// Tacit — PRIVATE provider cost models (server-side only).
//
// These are each provider agent's confidential inputs to its bid: a base cost
// per service category, a margin policy, and a personality for transcript color.
// They are NEVER included in any API response and NEVER shown to another
// provider — a provider's LLM prompt only ever contains its OWN profile. The
// deterministic `mult` is the LOCKED fallback (budget × mult → 31/42/28 @ $50),
// used verbatim when no LLM key is configured.

import type { Persona } from '../types';

export type Category = 'research' | 'data' | 'compute' | 'creative' | 'other';

export const CATEGORIES: Category[] = ['research', 'data', 'compute', 'creative', 'other'];

/** Trivial keyword pass: RFS text → service category (feeds the cost model). */
export function inferCategory(text: string): Category {
  const t = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  if (has('gpu', 'compute', 'training', 'train ', 'inference', 'fine-tune', 'render', 'simulation', 'model run')) return 'compute';
  if (has('dataset', 'data feed', 'scrape', 'crawl', 'records', 'labeled', 'annotation', 'ingest', ' data ')) return 'data';
  if (has('design', 'logo', 'brand', 'copywriting', 'copy ', 'content', 'illustration', 'video', 'creative', 'image')) return 'creative';
  if (has('research', 'analysis', 'report', 'intelligence', 'competitive', 'market', 'study', 'diligence', 'landscape')) return 'research';
  return 'other';
}

export interface ProviderProfile {
  id: Persona; // providerA | providerB | providerC
  label: string;
  /** Public one-liner (safe to show) — the transcript flavor seed. Never numeric. */
  personality: string;
  /** Fallback sealed-note copy (no numbers). */
  blurb: string;
  /** LOCKED deterministic fallback multiplier (budget × mult). Do not change. */
  mult: number;
  /** Margin policy label + target markup over cost (private; feeds the LLM only). */
  margin: { policy: 'premium' | 'balanced' | 'lean'; markup: number };
  /** Private base cost ($) per service category (feeds the LLM only). */
  cost: Record<Category, number>;
}

// Ordering by cost/margin keeps the winner consistent with the locked fallback
// (lean C is cheapest, premium A mid, high-touch B priciest → winner C).
export const PROFILES: ProviderProfile[] = [
  {
    id: 'providerA',
    label: 'Provider A',
    personality: 'premium sources and senior analysts — quality over speed',
    blurb: 'Premium sources · senior analyst · 24h turnaround',
    mult: 0.62,
    margin: { policy: 'premium', markup: 0.32 },
    cost: { research: 22, data: 26, compute: 34, creative: 20, other: 22 },
  },
  {
    id: 'providerB',
    label: 'Provider B',
    personality: 'human-in-the-loop review on every deliverable — higher touch',
    blurb: 'Human analyst review · thorough QA',
    mult: 0.84,
    margin: { policy: 'balanced', markup: 0.18 },
    cost: { research: 30, data: 34, compute: 44, creative: 28, other: 30 },
  },
  {
    id: 'providerC',
    label: 'Provider C',
    personality: 'automated pipeline — lean and aggressive on price',
    blurb: 'Automated pipeline · lowest cost',
    mult: 0.56,
    margin: { policy: 'lean', markup: 0.08 },
    cost: { research: 16, data: 19, compute: 26, creative: 15, other: 16 },
  },
];
