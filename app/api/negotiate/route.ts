import { NextResponse } from 'next/server';
import { negotiateCore, buildDealFromCore } from '@/app/lens/agents/negotiation';
import { ledgerReachable } from '@/app/lens/ledger/client';
import { settleNegotiation, type LedgerRefs } from '@/app/lens/ledger/write';
import { buildLedgerDeal } from '@/app/lens/ledger/read';

// Run one autonomous agent negotiation, persist it to the live Canton ledger
// (when reachable), and return { transcript, deal, usedLLM, ledger }.
// Dev note: this route is x402-bypassed in dev mode; prod-excluding it from the
// payment matcher is a later deploy item (middleware.ts).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(opts: { intent?: string; description?: string; budget?: number }) {
  const core = await negotiateCore(opts);
  let deal = buildDealFromCore(core); // in-memory fallback
  let dealSource: 'ledger' | 'memory' = 'memory';

  let ledger: LedgerRefs = { written: false };
  if (await ledgerReachable()) {
    // Settle atomically on Canton (RFS → sealed bids → Award choice), then build
    // the Lens deal from per-party ledger snapshots.
    const { refs, snapshot } = await settleNegotiation(core);
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
  return handle({
    intent: body?.intent,
    description: body?.description,
    budget: typeof body?.budget === 'number' ? body.budget : undefined,
  });
}
