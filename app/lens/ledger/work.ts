// Tacit Work — buyer-side orchestration of the real fulfillment lifecycle.
//
// Open → wait for THREE runner-created sealed bids → verify each on-ledger →
// frozen Rfs.Award (award + prepay the lowest) → Assign the work → wait for the
// winner's PrivateDelivery → recompute SHA-256 OFF-LEDGER → Accept → Receipt.
//
// Devnet/v2 only. NO deterministic-provider fallback, NO internal bid generation,
// NO memory settlement. The buyer never manufactures or submits provider bids —
// the three separate runner processes do. Idempotent on jobId via ledger state.
import crypto from 'crypto';
import {
  create, exercise, queryAs, ensureParty, pinnedParty, partyHint, T, LEDGER_MODE_ACTIVE, ledgerReachable,
} from './client';

const WORK_PKG = process.env.TACIT_WORK_PACKAGE_NAME || 'tacit-work';
export const TW = {
  RequestDraft: `#${WORK_PKG}:TacitWork:RequestDraft`,
  ActiveWorkRequest: `#${WORK_PKG}:TacitWork:ActiveWorkRequest`,
  Assignment: `#${WORK_PKG}:TacitWork:Assignment`,
  PrivateDelivery: `#${WORK_PKG}:TacitWork:PrivateDelivery`,
  DeliveryReceipt: `#${WORK_PKG}:TacitWork:DeliveryReceipt`,
};

const sha256Hex = (s: string) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Buyer's OFF-LEDGER verification: received bytes must match the committed hash + length. */
export function verifyDelivery(reportJson: string, committedSha: string, committedByteLen: number) {
  const computedSha = sha256Hex(reportJson);
  const computedLen = Buffer.byteLength(reportJson, 'utf8');
  return { ok: computedSha === committedSha && computedLen === committedByteLen, computedSha, computedLen };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pollFor<R>(fn: () => Promise<R | null>, timeoutMs: number, everyMs = 1500): Promise<R | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(everyMs);
  }
}

export interface WorkParams {
  jobId: string;
  serviceType: string;
  input: { url?: string };
  maxBudget: number;
  buyerName?: string;
}

export interface WorkResult {
  ok: true;
  mode: string;
  jobId: string;
  rfsId: string;
  workPackage: string;
  serviceType: string;
  input: { url: string };
  parties: { buyer: string; providerA: string; providerB: string; providerC: string; auditor: string };
  bids: { provider: string; providerLabel: string; contractId: string; price: number }[];
  winner: { provider: string; providerLabel: string; price: number };
  settlementContractId: string;
  paymentIouContractId: string;
  amount: number;
  currency: string;
  assignmentContractId: string;
  deliveryContractId: string;
  receiptContractId: string;
  report: unknown;
  reportSha256: string;
  reportByteLen: number;
  buyerVerified: { ok: boolean; computedSha: string; computedLen: number };
  visibility: {
    receipt: { buyer: boolean; winner: boolean; auditor: boolean; loser: boolean };
    privateDelivery: { buyer: boolean; auditor: boolean; loser: boolean };
  };
  resumed: boolean;
}

export async function procureWork(params: WorkParams, opts: { bidTimeoutMs?: number; deliveryTimeoutMs?: number } = {}): Promise<WorkResult> {
  if (LEDGER_MODE_ACTIVE === 'sandbox') throw new Error('tacit-work requires devnet/canton3-local (v2 ledger), not sandbox');
  if (!(await ledgerReachable())) throw new Error('ledger unreachable — tacit-work has no fallback');
  if (params.serviceType !== 'site_audit') throw new Error(`unsupported serviceType ${params.serviceType}`);
  const url = String(params.input?.url || '');
  if (!/^https:\/\//i.test(url)) throw new Error('input.url must be an https:// URL');

  const bidTimeout = opts.bidTimeoutMs ?? 45_000;
  const delivTimeout = opts.deliveryTimeoutMs ?? 45_000;

  // The buyer acts as a pinned party. The shared devnet validator's party
  // *listing* hangs, so a non-pinned buyerName can't be resolved by allocation
  // reliably — prefer the pinned identity (buyerName stays a display label).
  const buyerHint = params.buyerName ? partyHint(params.buyerName) : 'Buyer';
  const buyer = pinnedParty(buyerHint) || pinnedParty('Buyer') || (await ensureParty(buyerHint));
  const pA = await ensureParty('ProviderA');
  const pB = await ensureParty('ProviderB');
  const pC = await ensureParty('ProviderC');
  const auditor = await ensureParty('Auditor');
  const invited = [pA, pB, pC];
  const label: Record<string, string> = { [pA]: 'providerA', [pB]: 'providerB', [pC]: 'providerC' };
  const rfsId = `WRK-${params.jobId}`;
  const serviceInput = JSON.stringify({ url });
  let resumed = false;

  // Assemble the final result by reading current ledger state (used on the happy
  // path AND for idempotent replays).
  const finish = async (
    winnerParty: string, settlementContractId: string, paymentIouContractId: string, amount: number,
    assignmentContractId: string, deliveryContractId: string, receiptContractId: string,
    reportJson: string, reportSha256: string, reportByteLen: number,
    bids: { provider: string; providerLabel: string; contractId: string; price: number }[],
    // Delivery visibility must be snapshotted BEFORE Accept archives the
    // PrivateDelivery — the caller passes it in.
    delVis: { buyer: boolean; auditor: boolean; loser: boolean },
  ): Promise<WorkResult> => {
    const buyerVerified = verifyDelivery(reportJson, reportSha256, reportByteLen);
    const recB = await queryAs(buyer, [TW.DeliveryReceipt], { jobId: params.jobId });
    const recW = await queryAs(winnerParty, [TW.DeliveryReceipt], { jobId: params.jobId });
    const recAud = await queryAs(auditor, [TW.DeliveryReceipt], { jobId: params.jobId });
    const loser = invited.find((p) => p !== winnerParty)!;
    const recLoser = await queryAs(loser, [TW.DeliveryReceipt], { jobId: params.jobId });
    return {
      ok: true, mode: LEDGER_MODE_ACTIVE, jobId: params.jobId, rfsId, workPackage: WORK_PKG,
      serviceType: params.serviceType, input: { url },
      parties: { buyer, providerA: pA, providerB: pB, providerC: pC, auditor },
      bids, winner: { provider: winnerParty, providerLabel: label[winnerParty] || winnerParty, price: amount },
      settlementContractId, paymentIouContractId, amount, currency: 'USD.demo',
      assignmentContractId, deliveryContractId, receiptContractId,
      report: safeParse(reportJson), reportSha256, reportByteLen, buyerVerified,
      visibility: {
        receipt: { buyer: recB.length > 0, winner: recW.length > 0, auditor: recAud.length > 0, loser: recLoser.length > 0 },
        privateDelivery: delVis,
      },
      resumed,
    };
  };

  // Detect an existing Assignment up front: Assign CONSUMES the ActiveWorkRequest,
  // so on a replay we must NOT re-Open a duplicate request — we resume from here.
  const existingAssign = (await queryAs(buyer, [TW.Assignment], { jobId: params.jobId })).find((r) => r.payload.rfsId === rfsId) || null;

  // ── 1) OPEN (idempotent; skipped once the work is already Assigned) ──────────
  let awrCid = '';
  if (!existingAssign) {
    let awr = (await queryAs(buyer, [TW.ActiveWorkRequest], { jobId: params.jobId })).find((r) => r.payload.rfsId === rfsId) || null;
    if (!awr) {
      const draftCid = await create(TW.RequestDraft, {
        jobId: params.jobId, rfsId, buyer, invitedProviders: invited, serviceType: params.serviceType,
        serviceInput, title: 'Website due-diligence audit', description: `site_audit of ${url}`,
        maxBudget: String(params.maxBudget), auditor,
      }, [buyer]);
      await exercise(TW.RequestDraft, draftCid, 'Open', {}, [buyer]);
      awr = (await queryAs(buyer, [TW.ActiveWorkRequest], { jobId: params.jobId })).find((r) => r.payload.rfsId === rfsId) || null;
      if (!awr) throw new Error('Open did not produce an ActiveWorkRequest');
    } else {
      resumed = true;
    }
    awrCid = awr.contractId;
  } else {
    resumed = true;
  }

  // ── 2) SETTLEMENT: wait for 3 runner bids, verify, award+prepay (or resume) ──
  let settleRow = (await queryAs(buyer, [T.Settlement], { rfsId }))[0] || null;
  let collectedBids: { provider: string; providerLabel: string; contractId: string; price: number }[] = [];
  if (!settleRow) {
    const bids = await pollFor(async () => {
      const rows = await queryAs(buyer, [T.SealedBid], { rfsId });
      const valid = rows
        .map((r) => ({ contractId: r.contractId, provider: String(r.payload.provider), price: Number(r.payload.price) }))
        .filter((b) => invited.includes(b.provider) && isFinite(b.price) && b.price > 0 && b.price <= params.maxBudget);
      const perProvider = new Map<string, typeof valid[number]>();
      for (const b of valid) if (!perProvider.has(b.provider)) perProvider.set(b.provider, b); // first bid per provider
      return perProvider.size === 3 ? [...perProvider.values()] : null;
    }, bidTimeout);
    if (!bids) throw new Error('did not receive three valid runner-created bids within the timeout');
    collectedBids = bids.map((b) => ({ ...b, providerLabel: label[b.provider] || b.provider }));
    const winner = bids.reduce((a, b) => (b.price < a.price ? b : a), bids[0]);
    const losers = bids.filter((b) => b.contractId !== winner.contractId).map((b) => b.contractId);
    const rfs = (await queryAs(buyer, [T.Rfs], { rfsId }))[0];
    if (!rfs) throw new Error('frozen Rfs missing before award');
    const iouCid = await create(T.Iou, { issuer: buyer, owner: buyer, amount: String(winner.price), currency: 'USD.demo' }, [buyer]);
    const settlementCid: string = await exercise(T.Rfs, rfs.contractId, 'Award', { winningBid: winner.contractId, losingBids: losers, paymentCid: iouCid }, [buyer]);
    settleRow = { contractId: settlementCid, payload: { provider: winner.provider, price: winner.price, paidIou: iouCid } } as any;
  }
  const settlementCid = settleRow.contractId;
  const settleP: any = settleRow.payload || (await queryAs(buyer, [T.Settlement], { rfsId }))[0]?.payload || {};
  const winnerParty = String(settleP.provider);
  const amount = Number(settleP.price);
  const paymentIou = String(settleP.paidIou || '');

  // ── 3) ASSIGN (idempotent; reuse the Assignment detected up front) ──────────
  let assignmentCid: string;
  if (existingAssign) {
    assignmentCid = existingAssign.contractId;
    resumed = true;
  } else {
    assignmentCid = await exercise(TW.ActiveWorkRequest, awrCid, 'Assign', { settlementCid }, [buyer]);
  }

  // ── 4) wait for the winner's PrivateDelivery, verify OFF-LEDGER, accept ──────
  let receipt = (await queryAs(buyer, [TW.DeliveryReceipt], { jobId: params.jobId }))[0] || null;
  const delivery = (await queryAs(buyer, [TW.PrivateDelivery], { jobId: params.jobId }))[0]
    || (receipt ? null : await pollFor(async () => (await queryAs(buyer, [TW.PrivateDelivery], { jobId: params.jobId }))[0] || null, delivTimeout));
  let reportJson = '';
  let reportSha = '';
  let reportLen = 0;
  if (delivery) {
    reportJson = String(delivery.payload.reportJson);
    reportSha = String(delivery.payload.sha256);
    reportLen = Number(delivery.payload.byteLen);
  } else if (receipt) {
    // already accepted in a prior run; delivery consumed. Reconstruct evidence from the receipt.
    reportSha = String(receipt.payload.sha256);
    reportLen = Number(receipt.payload.byteLen);
    reportJson = '';
  } else {
    throw new Error('winner did not deliver within the timeout');
  }

  let deliveryCid = delivery?.contractId || '';

  // Snapshot PrivateDelivery visibility per persona BEFORE Accept consumes it —
  // the buyer (observer) sees it; the auditor and losing providers must NOT.
  const loserParty = invited.find((p) => p !== winnerParty)!;
  const delVis = {
    buyer: (await queryAs(buyer, [TW.PrivateDelivery], { jobId: params.jobId })).some((r) => r.payload.rfsId === rfsId),
    auditor: (await queryAs(auditor, [TW.PrivateDelivery], { jobId: params.jobId })).some((r) => r.payload.rfsId === rfsId),
    loser: (await queryAs(loserParty, [TW.PrivateDelivery], { jobId: params.jobId })).some((r) => r.payload.rfsId === rfsId),
  };

  if (!receipt) {
    const check = verifyDelivery(reportJson, reportSha, reportLen);
    if (!check.ok) throw new Error(`delivery hash/length verification FAILED (computed ${check.computedSha.slice(0, 12)}… vs committed ${reportSha.slice(0, 12)}…) — refusing to accept`);
    const receiptCid: string = await exercise(TW.PrivateDelivery, deliveryCid, 'Accept', { acceptedAt: new Date().toISOString() }, [buyer]);
    receipt = { contractId: receiptCid, payload: { sha256: reportSha, byteLen: reportLen } } as any;
  } else {
    resumed = true;
  }

  return finish(winnerParty, settlementCid, paymentIou, amount, assignmentCid, deliveryCid, receipt!.contractId, reportJson, reportSha, reportLen, collectedBids, delVis);
}

function safeParse(s: string): unknown {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
