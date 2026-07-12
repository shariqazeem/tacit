// Tacit Work — buyer-side orchestration of the real fulfillment lifecycle.
//
// Open → wait for THREE runner-created sealed bids → verify each on-ledger →
// frozen Rfs.Award (award + prepay the lowest) → Assign the work → wait for the
// winner's PrivateDelivery → recompute SHA-256 OFF-LEDGER → Accept → Receipt.
//
// Devnet/v2 only. NO deterministic-provider fallback, NO internal bid generation,
// NO memory settlement. The buyer never manufactures or submits provider bids —
// the three separate runner processes do. Idempotent on jobId via ledger state.
//
// Per-persona visibility is captured by REAL queries at each lifecycle point
// (bids BEFORE Award archives them; delivery BEFORE Accept archives it), so the
// /work lens reflects actual ledger reads — never hardcoded rules.
import crypto from 'crypto';
import {
  create, exercise, queryAs, ensureParty, pinnedParty, partyHint, T, PACKAGE_ID, LEDGER_MODE_ACTIVE, ledgerReachable,
} from './client';
import {
  WORK_SCHEMA, WORK_PERSONAS, type Persona, type WorkResult, type SiteAuditReport, type BidView,
} from './workTypes';

const WORK_PKG = process.env.TACIT_WORK_PACKAGE_NAME || 'tacit-work';
const CORE_PKG_ID = PACKAGE_ID || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
const WORK_PKG_ID = process.env.TACIT_WORK_PACKAGE_ID || '9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed';

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

const boolMap = (): Record<Persona, boolean> => ({ buyer: false, providerA: false, providerB: false, providerC: false, auditor: false });
const cidMap = (): Record<Persona, string[]> => ({ buyer: [], providerA: [], providerB: [], providerC: [], auditor: [] });

export interface WorkParams {
  jobId: string;
  serviceType: string;
  input: { url?: string };
  maxBudget: number;
  buyerName?: string;
}

export async function procureWork(
  params: WorkParams,
  opts: { bidTimeoutMs?: number; deliveryTimeoutMs?: number } = {},
): Promise<WorkResult> {
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

  const personaParties: { key: Persona; party: string }[] = [
    { key: 'buyer', party: buyer },
    { key: 'providerA', party: pA },
    { key: 'providerB', party: pB },
    { key: 'providerC', party: pC },
    { key: 'auditor', party: auditor },
  ];
  // Real per-party reads. `snapCids` records which contract ids each persona
  // actually received; `snapBool` is presence-only.
  const snapCids = async (templateId: string, filter: Record<string, unknown>): Promise<Record<Persona, string[]>> => {
    const out = cidMap();
    for (const { key, party } of personaParties) out[key] = (await queryAs(party, [templateId], filter)).map((r) => r.contractId);
    return out;
  };
  const snapBool = async (templateId: string, filter: Record<string, unknown>): Promise<Record<Persona, boolean>> => {
    const out = boolMap();
    for (const { key, party } of personaParties) out[key] = (await queryAs(party, [templateId], filter)).length > 0;
    return out;
  };

  // Visibility accumulators (filled only on the fresh path; left empty on resume).
  let visBids = cidMap();
  let visAwr = boolMap();
  let visSettle = boolMap();
  let visAssign = boolMap();
  let visDelivery = boolMap();
  let visReceipt = boolMap();
  let didAward = false;

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
  let collectedBids: BidView[] = [];
  if (!settleRow) {
    const bids = await pollFor(async () => {
      const rows = await queryAs(buyer, [T.SealedBid], { rfsId });
      const valid = rows
        .map((r) => ({ contractId: r.contractId, provider: String(r.payload.provider), price: Number(r.payload.price) }))
        .filter((b) => invited.includes(b.provider) && isFinite(b.price) && b.price > 0 && b.price <= params.maxBudget);
      const perProvider = new Map<string, (typeof valid)[number]>();
      for (const b of valid) if (!perProvider.has(b.provider)) perProvider.set(b.provider, b); // first bid per provider
      return perProvider.size === 3 ? [...perProvider.values()] : null;
    }, bidTimeout);
    if (!bids) throw new Error('did not receive three valid runner-created bids within the timeout');
    const winner = bids.reduce((a, b) => (b.price < a.price ? b : a), bids[0]);
    collectedBids = bids.map((b) => ({
      provider: b.provider, providerLabel: label[b.provider] || b.provider, contractId: b.contractId,
      price: b.price, winner: b.contractId === winner.contractId,
    }));

    // Snapshot bid + request visibility BEFORE Award archives the sealed bids.
    visBids = await snapCids(T.SealedBid, { rfsId });
    visAwr = await snapBool(TW.ActiveWorkRequest, { jobId: params.jobId });

    const losers = bids.filter((b) => b.contractId !== winner.contractId).map((b) => b.contractId);
    const rfs = (await queryAs(buyer, [T.Rfs], { rfsId }))[0];
    if (!rfs) throw new Error('frozen Rfs missing before award');
    const iouCid = await create(T.Iou, { issuer: buyer, owner: buyer, amount: String(winner.price), currency: 'USD.demo' }, [buyer]);
    const settlementCid: string = await exercise(T.Rfs, rfs.contractId, 'Award', { winningBid: winner.contractId, losingBids: losers, paymentCid: iouCid }, [buyer]);
    settleRow = { contractId: settlementCid, payload: { provider: winner.provider, price: winner.price, paidIou: iouCid } } as any;
    didAward = true;
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
  if (didAward) {
    visSettle = await snapBool(T.Settlement, { rfsId });
    visAssign = await snapBool(TW.Assignment, { jobId: params.jobId });
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
    // Snapshot delivery visibility BEFORE Accept consumes the PrivateDelivery.
    if (didAward) visDelivery = await snapBool(TW.PrivateDelivery, { jobId: params.jobId });
  } else if (receipt) {
    // Already accepted in a prior run; delivery consumed. We have the receipt's
    // commitment (sha256 + byteLen) but NOT the report body — never fabricate it.
    reportSha = String(receipt.payload.sha256);
    reportLen = Number(receipt.payload.byteLen);
    reportJson = '';
  } else {
    throw new Error('winner did not deliver within the timeout');
  }

  const deliveryCid = delivery?.contractId || '';
  if (delivery && !receipt) {
    const check = verifyDelivery(reportJson, reportSha, reportLen);
    if (!check.ok) {
      throw new Error(
        `delivery hash/length verification FAILED (computed ${check.computedSha.slice(0, 12)}… vs committed ${reportSha.slice(0, 12)}…) — refusing to accept`,
      );
    }
    const receiptCid: string = await exercise(TW.PrivateDelivery, deliveryCid, 'Accept', { acceptedAt: new Date().toISOString() }, [buyer]);
    receipt = { contractId: receiptCid, payload: { sha256: reportSha, byteLen: reportLen } } as any;
  } else {
    resumed = true;
  }
  if (didAward) visReceipt = await snapBool(TW.DeliveryReceipt, { jobId: params.jobId });

  // ── assemble the honest contract ─────────────────────────────────────────────
  const reportAvailable = !!delivery; // real bytes were loaded (and re-hashed) THIS request
  const report = reportAvailable ? (safeParse(reportJson) as SiteAuditReport | null) : null;

  return {
    ok: true,
    schema: WORK_SCHEMA,
    mode: LEDGER_MODE_ACTIVE,
    jobId: params.jobId,
    rfsId,
    workPackage: WORK_PKG,
    serviceType: params.serviceType,
    buyerLabel: params.buyerName || 'Buyer',
    input: { url },
    parties: { buyer, providerA: pA, providerB: pB, providerC: pC, auditor },
    bids: collectedBids,
    winner: { provider: winnerParty, providerLabel: label[winnerParty] || winnerParty, price: amount },
    amount,
    currency: 'USD.demo',
    artifact: {
      available: reportAvailable,
      report,
      sha256: reportSha,
      byteLength: reportLen,
      verifiedThisRequest: reportAvailable,
    },
    evidence: {
      corePackageId: CORE_PKG_ID,
      workPackageId: WORK_PKG_ID,
      settlementContractId: settlementCid,
      paymentIouContractId: paymentIou || undefined,
      assignmentContractId: assignmentCid || undefined,
      deliveryContractId: deliveryCid || undefined,
      receiptContractId: receipt!.contractId,
    },
    resumption: {
      resumed,
      historicalArtifactNotLoaded: !reportAvailable,
    },
    visibility: {
      available: didAward,
      personas: [...WORK_PERSONAS],
      bids: visBids,
      activeWorkRequest: visAwr,
      settlement: visSettle,
      assignment: visAssign,
      privateDelivery: visDelivery,
      receipt: visReceipt,
    },
  };
}

function safeParse(s: string): unknown {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
