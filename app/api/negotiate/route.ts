import { NextResponse } from 'next/server';
import { negotiateCore, buildDealFromCore } from '@/app/lens/agents/negotiation';
import { llmAvailable } from '@/app/lens/agents/llm';
import { ledgerReachable } from '@/app/lens/ledger/client';
import { settleNegotiation, type LedgerRefs } from '@/app/lens/ledger/write';
import { buildLedgerDeal } from '@/app/lens/ledger/read';
import { getProviderBalances } from '@/app/lens/ledger/economy';

// Run one autonomous agent negotiation, persist it to the live Canton ledger
// (when reachable), and return { transcript, deal, usedLLM, ledger, dealSource }.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(opts: { intent?: string; description?: string; budget?: number; buyerName?: string }) {
  const reachable = await ledgerReachable();

  // Balance-aware bidding: fetch each provider's ledger balance only when the
  // ledger is up AND an LLM will actually use it (the deterministic fallback
  // ignores balances). Best-effort — never blocks the negotiation.
  const balances = reachable && llmAvailable() ? await getProviderBalances() : undefined;

  const core = await negotiateCore({ ...opts, balances });
  let deal = buildDealFromCore(core); // in-memory fallback
  let dealSource: 'ledger' | 'memory' = 'memory';

  let ledger: LedgerRefs = { written: false };
  if (reachable) {
    // Settle atomically on Canton (RFS → sealed bids → Award choice w/ payment),
    // then build the Lens deal from per-party ledger snapshots. Runs as the
    // custom buyer party when a buyerName was supplied.
    const { refs, snapshot } = await settleNegotiation(core, { buyerHint: opts.buyerName });
    ledger = refs;
    if (refs.written && snapshot) {
      try {
        deal = buildLedgerDeal(core, snapshot);
        dealSource = 'ledger';
      } catch {
        /* keep in-memory deal */
      }
    }
  } else {
    ledger = { written: false, error: 'ledger unreachable' };
  }

  return NextResponse.json({ transcript: core.transcript, deal, usedLLM: core.usedLLM, ledger, dealSource });
}

const BUYER_RE = /^[A-Za-z0-9 _-]{3,24}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const budgetRaw = Number(searchParams.get('budget'));
  const budget = isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : undefined;
  const intent = searchParams.get('intent') || undefined;
  return handle({ budget, intent });
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty/invalid body -> defaults */
  }

  // Additive, validated procurement params (used by the MCP server + any
  // programmatic caller). Absent/invalid values become `undefined`, so
  // negotiateCore falls back to its seeded defaults and existing UI behavior
  // (GET, or POST with an empty body) is unchanged.
  const rawDesc =
    typeof body?.description === 'string' ? body.description : typeof body?.intent === 'string' ? body.intent : '';
  const description = rawDesc.trim() ? rawDesc.trim().slice(0, 200) : undefined; // ≤ 200 chars → the RFS title

  const rawBudget =
    typeof body?.maxBudget === 'number' ? body.maxBudget : typeof body?.budget === 'number' ? body.budget : NaN;
  const budget = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.min(Math.round(rawBudget), 10000) : undefined; // 1–10000

  // Optional external-agent identity: run the whole flow as this Canton party.
  const rawBuyer = typeof body?.buyerName === 'string' ? body.buyerName.trim() : '';
  const buyerName = BUYER_RE.test(rawBuyer) ? rawBuyer : undefined;

  return handle({ intent: description, description, budget, buyerName });
}
