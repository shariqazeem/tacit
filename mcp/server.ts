#!/usr/bin/env node
/**
 * Tacit MCP server — expose Tacit (private sealed-bid agent commerce on Canton)
 * as tools any MCP-capable AI agent can call.
 *
 * This is a THIN CLIENT of the Tacit app's HTTP API (/api/negotiate,
 * /api/economy, /api/health) — one source of truth. It never touches
 * Daml/Canton directly. Honesty propagates: every result carries its
 * dealSource, and a simulation (memory) result never claims a ledger settlement
 * or that value moved.
 *
 * stdout is the JSON-RPC channel — all diagnostics go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const APP_URL = (process.env.TACIT_APP_URL || 'http://localhost:3100').replace(/\/$/, '');
const NAME_RE = /^[A-Za-z0-9 _-]{3,24}$/;

// ── HTTP helper ───────────────────────────────────────────────
async function fetchJson(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 15000,
): Promise<{ ok: boolean; status: number; json: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const t = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(t);
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

function appDownResult(e: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text:
          `Could not reach the Tacit app at ${APP_URL}.\n` +
          `Start it (from the repo root: \`npm run build && npm start\`, or \`npm run dev\`), ` +
          `or point TACIT_APP_URL at a running instance. Then retry.\n` +
          `(details: ${errText(e)})`,
      },
    ],
  };
}

// ── Server ────────────────────────────────────────────────────
const server = new McpServer({ name: 'tacit', version: '0.3.0' });

const HTTPS_RE = /^https:\/\/[^\s]{1,2048}$/i;
const workJobId = () => `wjob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// tacit_health
server.tool(
  'tacit_health',
  'Check whether the Tacit app and the Canton ledger are live. Call this before tacit_procure to know whether a real on-ledger settlement is possible or whether procurement will run in simulation.',
  async () => {
    try {
      const { json: h } = await fetchJson(`${APP_URL}/api/health`, {}, 6000);
      const reachable = !!h?.canton?.reachable;
      return text(
        [
          `Tacit app: ${h?.app === 'ok' ? 'up' : 'unknown/degraded'}  (${APP_URL})`,
          `Canton ledger: ${reachable ? 'reachable' : 'NOT reachable'}${h?.canton?.error ? ` — ${h.canton.error}` : ''}`,
          `Daml package id: ${h?.packageId?.short ?? 'unknown'}${h?.packageId?.fromEnv === false ? ' (default)' : ''}`,
          reachable
            ? 'Ready: tacit_procure will settle privately on Canton and return real contract ids.'
            : 'Note: tacit_procure will run in SIMULATION (no value moves) until the Canton ledger is up.',
        ].join('\n'),
      );
    } catch (e) {
      return appDownResult(e);
    }
  },
);

// tacit_procure
const procureOut = {
  dealSource: z.enum(['ledger', 'memory']),
  buyerParty: z.string(),
  winner: z.string(),
  amount: z.number(),
  currency: z.string(),
  settlementCid: z.string(),
  iou: z.string(),
};

server.registerTool(
  'tacit_procure',
  {
    description:
      "Run a private sealed-bid procurement between AI agents on Canton, AS YOUR OWN Canton party. Post a request, collect sealed bids from provider agents (each price visible only to that provider and you), then atomically award AND pay the winner in a single Daml transaction. Returns real ledger contract ids when Canton is live (or a clearly-labeled simulation when it isn't). Can take ~10–20s against a cold ledger.",
    inputSchema: {
      description: z
        .string()
        .min(1)
        .max(200)
        .describe('What to procure — becomes the request\'s service title (e.g. "Competitive analysis of three DeFi lending protocols").'),
      maxBudget: z.number().positive().max(10000).describe('Maximum budget in USD (1–10000). Providers bid at or below this; the lowest sealed bid wins.'),
      buyerName: z
        .string()
        .regex(NAME_RE)
        .optional()
        .describe('Your Canton party name (3–24 chars, letters/digits/space/_/-). You settle as THIS party; other buyers cannot see your deal. Defaults to "Claude-Agent".'),
    },
    outputSchema: procureOut,
  },
  async ({ description, maxBudget, buyerName }) => {
    const buyer = buyerName?.trim() || 'Claude-Agent';
    let data: any;
    try {
      const res = await fetchJson(
        `${APP_URL}/api/negotiate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, maxBudget, buyerName: buyer }) },
        30000,
      );
      if (!res.ok || !res.json?.deal) {
        return { isError: true, content: [{ type: 'text' as const, text: `Tacit /api/negotiate returned an unexpected response (HTTP ${res.status}).` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }

    const deal = data.deal;
    const source: 'ledger' | 'memory' = data.dealSource === 'ledger' ? 'ledger' : 'memory';
    const s = deal.settlement ?? {};
    const service = deal.rfs?.title?.value ?? description;
    const budgetLabel = deal.rfs?.budget?.value ?? `Budget < $${maxBudget}`;
    const bidCount = Array.isArray(deal.bids) ? deal.bids.length : 0;
    const winner = s.winner?.value ?? 'the lowest bid';
    const amount = Number(s.amount?.value ?? 0);
    const pay = s.payment;
    const settlementCid = source === 'ledger' ? String(data.ledger?.contracts?.settlement ?? '') : '';
    const iou = source === 'ledger' ? String(data.ledger?.contracts?.iou ?? pay?.iouContractId?.value ?? '') : '';
    const currency = source === 'ledger' ? String(pay?.currency?.value ?? 'USD.demo') : '';

    const lines: string[] = [`PROCUREMENT — ${service}`, `${budgetLabel} · ${bidCount} sealed bids received`, ''];
    if (source === 'ledger') {
      lines.push('✅ ON CANTON — awarded and paid in one atomic Daml transaction (losers archived, winner accepted, value moved, settlement created).');
      lines.push(`Winner: ${winner} at $${amount}`);
      lines.push(`Settlement contract: ${settlementCid}`);
      if (pay) lines.push(`Payment: ${pay.amount?.value} ${currency} transferred to the winner — IOU contract ${iou}`);
      lines.push('');
      lines.push(`You transacted as your own Canton party: ${buyer}. The app's default buyer cannot see this settlement — verify via tacit_my_deals.`);
      lines.push("Sealed bids: each losing provider never saw competitors' prices — enforced by Canton's signatory/observer model, not by application code.");
      lines.push('A permissioned Auditor party can verify this settlement — without ever seeing the sealed bids.');
      lines.push(`View this deal in the Ledger Lens: ${APP_URL}/lens`);
    } else {
      lines.push('⚠️  SIMULATION — Canton unreachable; no value moved and nothing was written to a ledger.');
      lines.push(`Winner (simulated, deterministic): ${winner} at $${amount}`);
      lines.push('Start the Canton ledger and retry (see tacit_health) for a real, private, on-ledger settlement with contract ids.');
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: { dealSource: source, buyerParty: buyer, winner, amount, currency, settlementCid, iou },
    };
  },
);

// tacit_my_deals
const myDealsOut = {
  available: z.boolean(),
  party: z.string(),
  earnings: z.number(),
  deals: z.number(),
  recent: z.array(z.object({ rfsId: z.string(), winner: z.string(), price: z.number(), contractId: z.string() })),
};

server.registerTool(
  'tacit_my_deals',
  {
    description:
      'Audit YOUR OWN private deal history on Canton: the settlements and earnings for a given party name, queried as that party. You get only what that party is a stakeholder of — another agent\'s deals are invisible. This is Tacit\'s privacy model demonstrated agent-to-agent.',
    inputSchema: {
      buyerName: z.string().regex(NAME_RE).describe('The Canton party name to audit (the same name you used with tacit_procure).'),
    },
    outputSchema: myDealsOut,
  },
  async ({ buyerName }) => {
    const party = buyerName.trim();
    let json: any;
    try {
      const res = await fetchJson(`${APP_URL}/api/economy?party=${encodeURIComponent(party)}`, {}, 15000);
      json = res.json;
    } catch (e) {
      return appDownResult(e);
    }

    if (!json?.available) {
      return {
        content: [{ type: 'text' as const, text: `No ledger-backed history for "${party}" — the Canton ledger is unreachable, or this party has settled no deals.` }],
        structuredContent: { available: false, party, earnings: 0, deals: 0, recent: [] },
      };
    }

    const recent = Array.isArray(json.recent) ? json.recent : [];
    const rows = recent.map((r: any) => ({ rfsId: String(r.rfsId), winner: String(r.winner), price: Number(r.price), contractId: String(r.contractId) }));
    const lines = [
      `DEAL HISTORY — party "${party}" (queried live as this party on Canton)`,
      `${rows.length} settlement(s) this party can see · earnings held: ${json.earnings} USD.demo`,
      '',
      ...rows.map((r: any) => `• ${r.winner} · $${r.price} · settlement ${r.contractId.slice(0, 12)}…`),
      '',
      'These are only the deals this party is a stakeholder of. Any other agent that runs tacit_my_deals for a different name gets a different (disjoint) history — that is the ledger enforcing privacy, not the app.',
    ];
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: { available: true, party, earnings: Number(json.earnings ?? 0), deals: rows.length, recent: rows },
    };
  },
);

// tacit_explain_privacy
server.tool(
  'tacit_explain_privacy',
  "Explain Tacit's privacy and atomicity model — how sealed bids stay private and what each perspective (Public / Buyer / Provider) can see. Use this to answer \"why is this private?\" without guessing.",
  async () => {
    return text(
      [
        'HOW TACIT KEEPS AGENT COMMERCE PRIVATE',
        '',
        "Privacy is enforced by Canton/Daml's signatory–observer model — never by application code.",
        '',
        '• Sealed bids — a `SealedBid` is signed by its provider with the buyer as the ONLY observer. Competing providers are not stakeholders, so the ledger never returns the contract to them. A competitor\'s node never even receives the data; there is nothing to leak.',
        '',
        '• Atomic award + payment — the buyer awards the lowest bid through ONE Daml transaction (`Rfs.Award`): reject the losers, accept the winner, transfer the payment (a demo USD.demo IOU) to the winner, and create the `Settlement` — all-or-nothing, guaranteed by the ledger.',
        '',
        '• Agent-to-agent privacy — an external agent settles as its OWN Canton party; a different party (even the app\'s default buyer) is not a stakeholder and cannot see that deal. tacit_my_deals proves it: each party sees only its own history.',
        '',
        '• Permissioned audit — the buyer may name an optional Auditor as an observer of the request and the settlement. The auditor can verify WHAT settled (winner, price, amount paid, title) but is never an observer of a SealedBid or an Iou — so it sees no sealed bid (not even the winner\'s) and no provider\'s wealth. Compliance without surveillance.',
        '',
        'WHAT EACH PERSPECTIVE SEES',
        '• Public: that a confidential deal exists and settled — never its prices, parties, or the payment.',
        '• Buyer: everything for ITS deals — the buyer is the observer on every sealed bid, so it alone can compare all prices and award.',
        '• A provider: only its own bid. Canton hides every competitor\'s price from it.',
        '• The winning provider: additionally sees the settlement and the payment it received — but still never saw a competitor\'s price.',
        '• The auditor (when named): the request + the settlement (winner, price, paid) — never a sealed bid or an IOU.',
        '',
        'Note: today the transferred value is a demo voucher (USD.demo), deliberately not a stablecoin — real stablecoin settlement is the next roadmap step.',
      ].join('\n'),
    );
  },
);

// ── Tacit Work (the REAL provider spine) ──────────────────────
// tacit_work_health
server.tool(
  'tacit_work_health',
  'Check whether Tacit Work is ready: Canton devnet + all three separate provider runner processes. Call before tacit_procure_work. There is NO simulation for work — if this is not ok, procurement cannot run.',
  async () => {
    try {
      const { json: h } = await fetchJson(`${APP_URL}/api/work/health`, {}, 8000);
      const runners = Array.isArray(h?.runners) ? h.runners : [];
      return text(
        [
          `Tacit Work: ${h?.ok ? 'READY' : 'NOT ready'}${h?.reason ? ` — ${h.reason}` : ''}`,
          `Ledger mode: ${h?.mode} · reachable: ${h?.ledgerReachable ? 'yes' : 'no'}`,
          `Packages: core ${h?.corePackage?.shortId}… · work ${h?.workPackage?.shortId}…`,
          `Provider runners ready: ${runners.length}/3${runners.length ? ` (${runners.map((r: any) => r.label).join(', ')})` : ''}`,
          `Distinct instances: ${h?.distinctInstances ? 'yes' : 'no'} · distinct processes: ${h?.distinctProcesses ? 'yes' : 'no'}`,
          h?.ok
            ? 'Ready: tacit_procure_work will run a real private procurement on Canton (no fallback).'
            : 'Not ready: tacit_procure_work will error until three distinct provider runners are up on devnet.',
        ].join('\n'),
      );
    } catch (e) {
      return appDownResult(e);
    }
  },
);

// tacit_procure_work
const workOut = {
  ok: z.boolean(),
  mode: z.string(),
  jobId: z.string(),
  resumed: z.boolean(),
  requestedUrl: z.string(),
  finalUrl: z.string().optional(),
  httpStatus: z.number().optional(),
  responseLatencyMs: z.number().optional(),
  winner: z.string(),
  amount: z.number(),
  currency: z.string(),
  settlementContractId: z.string(),
  deliveryContractId: z.string().optional(),
  receiptContractId: z.string(),
  sha256: z.string().optional(),
  byteLength: z.number().optional(),
  verifiedThisRequest: z.boolean(),
  visibility: z.string(),
};

server.registerTool(
  'tacit_procure_work',
  {
    description:
      'Procure REAL work on Canton: three separate provider processes submit sealed bids as distinct Canton parties, the buyer awards + prepays the lowest, the winner performs a real website audit (site_audit) and delivers it privately, and the buyer verifies the delivered bytes off-ledger before accepting — leaving an auditor-visible receipt. No simulation, no fallback: if the network is not ready this errors. Can take ~15–40s.',
    inputSchema: {
      url: z.string().regex(HTTPS_RE).describe('The https:// website to audit (e.g. https://example.com).'),
      maxBudget: z.number().positive().max(10000).describe('Maximum budget in USD.demo (a demo voucher). The lowest sealed bid at or below this wins.'),
      jobId: z.string().regex(/^[A-Za-z0-9._:-]{3,64}$/).optional().describe('Optional idempotency key. Reuse the SAME jobId to safely resume a job after a timeout — the ledger will not pay twice. Omit to start a fresh job.'),
      buyerLabel: z.string().max(64).optional().describe('Optional display label for the buyer. The workflow acts through the pinned buyer party — this does NOT allocate a distinct Canton party.'),
    },
    outputSchema: workOut,
  },
  async ({ url, maxBudget, jobId, buyerLabel }) => {
    const id = jobId || workJobId();
    let data: any;
    try {
      const res = await fetchJson(
        `${APP_URL}/api/work/procure`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: id, serviceType: 'site_audit', input: { url }, maxBudget, buyerName: buyerLabel }) },
        150000,
      );
      if (!res.ok || !res.json?.ok) {
        const err = res.json?.error || `HTTP ${res.status}`;
        return { isError: true, content: [{ type: 'text' as const, text: `Tacit Work procurement failed (no fallback): ${err}\nJob id ${id} — reuse it with tacit_procure_work to safely resume (idempotent, no double payment).` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }

    const rep = data.artifact?.report;
    const ev = data.evidence || {};
    const winnerLabel = data.winner?.providerLabel ?? 'the winner';
    const lines: string[] = [
      `TACIT WORK — site_audit of ${url}`,
      `Mode: ${data.mode}${data.resumption?.resumed ? ' · resumed existing job' : ''}`,
      '',
      'Three separate provider processes bid as distinct Canton parties (one shared hosted-validator credential — not separate validators or organizations).',
      `Winner: ${winnerLabel} · awarded and prepaid ${data.amount} ${data.currency} (a demo voucher, not real money).`,
      '',
    ];
    if (data.artifact?.available && rep) {
      lines.push(`Audit: HTTP ${rep.httpStatus} in ${rep.responseLatencyMs}ms · score ${rep.score} · ${data.artifact.byteLength} bytes.`);
      lines.push(`The buyer verified the exact delivered bytes off-ledger: SHA-256 ${data.artifact.sha256?.slice(0, 16)}… matches the on-ledger commitment.`);
    } else {
      lines.push('This job was already accepted earlier; the report body is not reconstructed by the active-contract reader. The settlement and receipt below are real.');
    }
    lines.push(`Private delivery: visible to buyer + winner only. Delivery receipt: buyer + winner + auditor — the auditor sees the receipt commitment, not the report.`);
    lines.push(`Settlement ${ev.settlementContractId} · Receipt ${ev.receiptContractId}`);
    lines.push(`View it in the browser: ${APP_URL}/work`);

    const visSummary = data.visibility?.available
      ? 'buyer sees all bids + report; each provider sees only its own bid; auditor sees the receipt, not the report'
      : 'per-party snapshot not reproduced for this resumed job';

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        ok: true,
        mode: String(data.mode),
        jobId: String(data.jobId ?? id),
        resumed: !!data.resumption?.resumed,
        requestedUrl: url,
        finalUrl: rep?.finalUrl,
        httpStatus: rep?.httpStatus,
        responseLatencyMs: rep?.responseLatencyMs,
        winner: String(winnerLabel),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? 'USD.demo'),
        settlementContractId: String(ev.settlementContractId ?? ''),
        deliveryContractId: ev.deliveryContractId,
        receiptContractId: String(ev.receiptContractId ?? ''),
        sha256: data.artifact?.sha256,
        byteLength: data.artifact?.byteLength,
        verifiedThisRequest: !!data.artifact?.verifiedThisRequest,
        visibility: visSummary,
      },
    };
  },
);

// ── Connect ───────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[tacit-mcp] connected over stdio · TACIT_APP_URL=${APP_URL}`);
}

main().catch((e) => {
  console.error('[tacit-mcp] fatal:', e);
  process.exit(1);
});
