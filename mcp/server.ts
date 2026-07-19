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
const server = new McpServer({ name: 'tacit', version: '0.7.0' });

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

// ── Tacit Work — the AGENTIC vendor-security workflow (primary) ────────────────
// tacit_list_services
server.tool(
  'tacit_list_services',
  'List the registered work services Tacit can procure and whether each has a live 3-runner capability quorum on Canton devnet. The launch service is vendor_security_assessment (a passive vendor web-security pre-screen). No simulation, no private provider policy.',
  async () => {
    try {
      const { json } = await fetchJson(`${APP_URL}/api/work/services`, {}, 8000);
      const svcs = Array.isArray(json?.services) ? json.services : [];
      return text([
        `Registered services (default: ${json?.defaultService}):`,
        ...svcs.map((s: any) => `• ${s.id} v${s.version}${s.legacy ? ' (legacy)' : ''} — ${s.available ? `AVAILABLE (${s.supportingRunners}/3 runners)` : `unavailable (${s.supportingRunners}/3 runners)`}`),
        '',
        'Use tacit_assess_vendor for a vendor security pre-screen, or tacit_probe_performance for a bounded web performance pre-screen (both real, no fallback).',
      ].join('\n'));
    } catch (e) {
      return appDownResult(e);
    }
  },
);

// tacit_assess_vendor
const assessOut = {
  ok: z.boolean(), mode: z.string(), jobId: z.string(), resumed: z.boolean(),
  requestedUrl: z.string(), finalUrl: z.string().optional(),
  score: z.number().optional(), riskBand: z.string().optional(),
  decision: z.string().optional(), decisionReasons: z.array(z.string()).optional(),
  findings: z.array(z.object({ id: z.string(), severity: z.string(), title: z.string(), remediation: z.string() })).optional(),
  winner: z.string(), amount: z.number(), currency: z.string(),
  providerCommittedSha256: z.string().optional(), buyerComputedSha256: z.string().nullable().optional(),
  verified: z.boolean(), settlementContractId: z.string(), receiptContractId: z.string(),
  privacy: z.string(),
};

server.registerTool(
  'tacit_assess_vendor',
  {
    description:
      'Procure a REAL passive vendor security assessment on Canton for onboarding due diligence. Three separate provider processes bid as distinct Canton parties; the winner performs a passive web-security pre-screen (TLS, headers, cookies, DNS/mail, security.txt); the buyer verifies hash + schema + target + score off-ledger before accepting; a deterministic buyer policy returns an onboarding decision; an auditor receives only the receipt. No fallback, no simulation, no LLM-invented facts. Can take ~15–45s. This is a passive pre-screen, NOT a penetration test or certification.',
    inputSchema: {
      url: z.string().regex(HTTPS_RE).describe('The vendor / API / MCP endpoint to assess (https:// only).'),
      maxBudget: z.number().positive().max(10000).describe('Maximum budget in USD.demo (a demo voucher).'),
      policyId: z.enum(['standard-saas-v1', 'strict-infrastructure-v1']).optional().describe('Onboarding policy (default standard-saas-v1).'),
      jobId: z.string().regex(/^[A-Za-z0-9._:-]{3,64}$/).optional().describe('Optional idempotency key; reuse to safely resume (no double payment).'),
      buyerLabel: z.string().max(64).optional().describe('Display label only — does NOT allocate a distinct Canton party.'),
    },
    outputSchema: assessOut,
  },
  async ({ url, maxBudget, policyId, jobId, buyerLabel }) => {
    const id = jobId || workJobId();
    let data: any;
    try {
      const res = await fetchJson(
        `${APP_URL}/api/work/procure`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: id, serviceType: 'vendor_security_assessment', input: { url }, maxBudget, policyId, buyerName: buyerLabel, requestSource: 'mcp' }) },
        150000,
      );
      if (!res.ok || !res.json?.ok) {
        return { isError: true, content: [{ type: 'text' as const, text: `Vendor assessment failed (no fallback): ${res.json?.error || `HTTP ${res.status}`}\nJob id ${id} — reuse it to safely resume.` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }
    if (data.artifact?.available && !data.buyerVerification?.verified) {
      return { isError: true, content: [{ type: 'text' as const, text: 'Buyer verification did not pass — refusing to report a success.' }] };
    }

    const rep = data.artifact?.report; const ev = data.evidence || {}; const pol = data.policy;
    const findings = Array.isArray(rep?.findings) ? rep.findings : [];
    const lines = [
      `VENDOR ASSESSMENT — ${url}  (${data.mode}${data.resumption?.resumed ? ' · resumed' : ''})`,
      'Three separate provider processes bid as distinct Canton parties (one shared hosted-validator credential — not separate validators or organizations).',
      `Winner ${data.winner?.providerLabel}: awarded and prepaid ${data.amount} ${data.currency} (a demo voucher, not real money).`,
      '',
    ];
    if (data.artifact?.available && rep) {
      lines.push(`Posture: ${rep.riskBand} · score ${rep.score}/100 · ${findings.length} finding(s).`);
      if (pol) lines.push(`Onboarding decision (${pol.policyId}): ${pol.decision.toUpperCase()} — ${pol.reasonCodes.join(', ')}.`);
      lines.push(`Buyer verified the exact delivered bytes off-ledger (hash + schema + target + score): committed ${rep && data.artifact.providerCommittedSha256?.slice(0, 12)}… == computed ${data.artifact.buyerComputedSha256?.slice(0, 12)}….`);
      lines.push('Top findings: ' + findings.slice(0, 3).map((f: any) => `${f.severity}:${f.title}`).join(' · '));
    } else {
      lines.push('This job was already accepted; the report body is not reconstructed. Settlement + receipt below are real.');
    }
    lines.push('Report is private to buyer + winner; the auditor sees the receipt commitment, not the report.');
    lines.push(`Settlement ${ev.settlementContractId} · Receipt ${ev.receiptContractId}`);

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        ok: true, mode: String(data.mode), jobId: String(data.jobId ?? id), resumed: !!data.resumption?.resumed,
        requestedUrl: url, finalUrl: rep?.finalUrl,
        score: rep?.score, riskBand: rep?.riskBand,
        decision: pol?.decision, decisionReasons: pol?.reasonCodes,
        findings: findings.map((f: any) => ({ id: f.id, severity: f.severity, title: f.title, remediation: f.remediation })),
        winner: String(data.winner?.providerLabel ?? ''), amount: Number(data.amount ?? 0), currency: String(data.currency ?? 'USD.demo'),
        providerCommittedSha256: data.artifact?.providerCommittedSha256, buyerComputedSha256: data.artifact?.buyerComputedSha256,
        verified: !!data.buyerVerification?.verified,
        settlementContractId: String(ev.settlementContractId ?? ''), receiptContractId: String(ev.receiptContractId ?? ''),
        privacy: 'report private to buyer + winner; auditor sees receipt only; sealed bids private per provider',
      },
    };
  },
);

// ── tacit_probe_performance ───────────────────────────────────
server.registerTool(
  'tacit_probe_performance',
  {
    description:
      'Procure a REAL bounded web performance probe on Canton. Three separate provider processes bid as distinct Canton parties; the winner takes 5 fresh-connection samples of the target (TTFB / TLS / total latency, transfer + caching posture, ALPN HTTP version); the buyer verifies hash + schema + target + score off-ledger before accepting; a deterministic latency-SLO policy returns a decision; an auditor receives only the receipt. No fallback, no simulation, no LLM-invented facts. Can take ~15–45s. This is a bounded pre-screen, NOT a load test or availability guarantee.',
    inputSchema: {
      url: z.string().regex(HTTPS_RE).describe('The public HTTPS endpoint to probe (https:// only).'),
      maxBudget: z.number().positive().max(10000).describe('Maximum budget in USD.demo (a demo voucher).'),
      policyId: z.enum(['latency-slo-standard-v1', 'latency-slo-strict-v1']).optional().describe('Latency SLO policy (default latency-slo-standard-v1).'),
      jobId: z.string().regex(/^[A-Za-z0-9._:-]{3,64}$/).optional().describe('Optional idempotency key; reuse to safely resume (no double payment).'),
      buyerLabel: z.string().max(64).optional().describe('Display label only — does NOT allocate a distinct Canton party.'),
    },
    outputSchema: assessOut,
  },
  async ({ url, maxBudget, policyId, jobId, buyerLabel }) => {
    const id = jobId || workJobId();
    let data: any;
    try {
      const res = await fetchJson(
        `${APP_URL}/api/work/procure`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: id, serviceType: 'web_performance_probe', input: { url }, maxBudget, policyId, buyerName: buyerLabel, requestSource: 'mcp' }) },
        150000,
      );
      if (!res.ok || !res.json?.ok) {
        return { isError: true, content: [{ type: 'text' as const, text: `Performance probe failed (no fallback): ${res.json?.error || `HTTP ${res.status}`}\nJob id ${id} — reuse it to safely resume.` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }
    if (data.artifact?.available && !data.buyerVerification?.verified) {
      return { isError: true, content: [{ type: 'text' as const, text: 'Buyer verification did not pass — refusing to report a success.' }] };
    }
    const rep = data.artifact?.report; const ev = data.evidence || {}; const pol = data.policy;
    const findings = Array.isArray(rep?.findings) ? rep.findings : [];
    const lines = [
      `WEB PERFORMANCE PROBE — ${url}  (${data.mode}${data.resumption?.resumed ? ' · resumed' : ''})`,
      'Three separate provider processes bid as distinct Canton parties (one shared hosted-validator credential — not separate validators or organizations).',
      `Winner ${data.winner?.providerLabel}: awarded and prepaid ${data.amount} ${data.currency} (a demo voucher, not real money).`,
      '',
    ];
    if (data.artifact?.available && rep) {
      lines.push(`Performance: ${rep.score?.band} · median TTFB ${rep.aggregates?.ttfb?.medianMs}ms · ${rep.protocol?.httpVersion} · score ${rep.score?.value}/100 · ${findings.length} finding(s).`);
      if (pol) lines.push(`Decision (${pol.policyId}): ${pol.decision.toUpperCase()} — ${pol.reasonCodes.join(', ')}.`);
      lines.push(`Buyer verified the exact delivered bytes off-ledger (hash + schema + target + score): committed ${data.artifact.providerCommittedSha256?.slice(0, 12)}… == computed ${data.artifact.buyerComputedSha256?.slice(0, 12)}….`);
      if (findings.length) lines.push('Top findings: ' + findings.slice(0, 3).map((f: any) => `${f.severity}:${f.title}`).join(' · '));
    } else {
      lines.push('This job was already accepted; the report body is not reconstructed. Settlement + receipt below are real.');
    }
    lines.push('Report is private to buyer + winner; the auditor sees the receipt commitment, not the report.');
    lines.push(`Settlement ${ev.settlementContractId} · Receipt ${ev.receiptContractId}`);

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        ok: true, mode: String(data.mode), jobId: String(data.jobId ?? id), resumed: !!data.resumption?.resumed,
        requestedUrl: url, finalUrl: rep?.target?.finalUrl,
        score: rep?.score?.value, riskBand: rep?.score?.band,
        decision: pol?.decision, decisionReasons: pol?.reasonCodes,
        findings: findings.map((f: any) => ({ id: f.id, severity: f.severity, title: f.title, remediation: f.remediation })),
        winner: String(data.winner?.providerLabel ?? ''), amount: Number(data.amount ?? 0), currency: String(data.currency ?? 'USD.demo'),
        providerCommittedSha256: data.artifact?.providerCommittedSha256, buyerComputedSha256: data.artifact?.buyerComputedSha256,
        verified: !!data.buyerVerification?.verified,
        settlementContractId: String(ev.settlementContractId ?? ''), receiptContractId: String(ev.receiptContractId ?? ''),
        privacy: 'report private to buyer + winner; auditor sees receipt only; sealed bids private per provider',
      },
    };
  },
);

// ── tacit_market_overview ─────────────────────────────────────
// A real agent capability: check provider track records + market liquidity from
// the AUDITOR's lawful view before deciding whom to hire. Never exposes sealed
// bids or report bodies — the ledger does not return them to the auditor.
server.registerTool(
  'tacit_market_overview',
  {
    description:
      "The Tacit agent economy from the AUDITOR's chair — computed live from on-ledger contracts the auditor party can lawfully see (settlements + delivery receipts). Returns market totals, per-provider treasuries + win-shares, and recent delivery-receipt commitments (sha256 + byteLen + winner + amount). Sealed bids, bid prices, report bodies, and assessment targets NEVER appear — Canton will not return them to the auditor. Use it to check a provider's track record before procuring.",
    inputSchema: {},
    outputSchema: {
      available: z.boolean(),
      viewer: z.string(),
      asOfUtc: z.string(),
      completedJobs: z.number(),
      totalVolume: z.number(),
      currency: z.string(),
      capableAgents: z.object({ ready: z.number(), total: z.number() }),
      servicesLive: z.number(),
      providers: z.array(z.object({ id: z.string(), label: z.string(), partyShort: z.string(), earned: z.number(), wins: z.number(), winShare: z.number(), ready: z.boolean(), servicesAdvertised: z.array(z.string()) })),
      recentReceipts: z.array(z.object({ acceptedAtUtc: z.string(), receiptCidShort: z.string(), sha256Short: z.string(), byteLen: z.number(), winnerLabel: z.string().nullable(), amount: z.number().nullable(), serviceType: z.string().nullable() })),
      degradation: z.array(z.string()),
    },
  },
  async () => {
    let data: any;
    try {
      const res = await fetchJson(`${APP_URL}/api/market/overview`, {}, 15000);
      if (!res.ok || res.json?.available !== true) {
        return { isError: true, content: [{ type: 'text' as const, text: `Market overview unavailable (no fabrication): ${res.json?.reason || `HTTP ${res.status}`}` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }
    const providers = Array.isArray(data.providers) ? data.providers : [];
    const receipts = Array.isArray(data.receipts) ? data.receipts : [];
    const lines = [
      `TACIT MARKET — auditor's lawful view (${data.viewer}) · as of ${data.asOfUtc}`,
      `${data.totals.completedJobs} completed jobs · ${data.totals.totalVolume} ${data.currency} total volume · ${data.meta.capableAgents.ready}/${data.meta.capableAgents.total} agents ready · ${data.meta.servicesLive} services live.`,
      '',
      'Providers (treasury = auditor-derived sum of settlement amounts):',
      ...providers.map((p: any) => `• ${p.label} (${p.partyShort}) — earned ${p.earned} ${data.currency} · ${p.wins} wins · ${Math.round(p.winShare * 100)}% share · ${p.ready ? 'ready' : 'idle'}`),
      '',
      `Recent delivery receipts (commitment only — report bodies never appear):`,
      ...receipts.slice(0, 5).map((r: any) => `• ${r.acceptedAtUtc} · ${r.winnerLabel ?? '—'} · ${r.serviceType ?? '—'} · ${r.amount == null ? '—' : r.amount + ' ' + data.currency} · sha256 ${r.sha256Short} · ${r.byteLen} bytes · body SEALED`),
    ];
    if (Array.isArray(data.degradation) && data.degradation.length) lines.push('', 'Notes: ' + data.degradation.join('; '));
    lines.push('', `Explore it: ${APP_URL}/market`);
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        available: true,
        viewer: String(data.viewer),
        asOfUtc: String(data.asOfUtc),
        completedJobs: Number(data.totals.completedJobs ?? 0),
        totalVolume: Number(data.totals.totalVolume ?? 0),
        currency: String(data.currency ?? 'USD.demo'),
        capableAgents: { ready: Number(data.meta?.capableAgents?.ready ?? 0), total: Number(data.meta?.capableAgents?.total ?? 0) },
        servicesLive: Number(data.meta?.servicesLive ?? 0),
        providers: providers.map((p: any) => ({ id: String(p.id), label: String(p.label), partyShort: String(p.partyShort), earned: Number(p.earned ?? 0), wins: Number(p.wins ?? 0), winShare: Number(p.winShare ?? 0), ready: !!p.ready, servicesAdvertised: Array.isArray(p.servicesAdvertised) ? p.servicesAdvertised.map(String) : [] })),
        recentReceipts: receipts.slice(0, 20).map((r: any) => ({ acceptedAtUtc: String(r.acceptedAtUtc), receiptCidShort: String(r.receiptCidShort), sha256Short: String(r.sha256Short), byteLen: Number(r.byteLen ?? 0), winnerLabel: r.winnerLabel ?? null, amount: r.amount == null ? null : Number(r.amount), serviceType: r.serviceType ?? null })),
        degradation: Array.isArray(data.degradation) ? data.degradation.map(String) : [],
      },
    };
  },
);

// ── tacit_mandate_status ──────────────────────────────────────
// Read the agent's STANDING SPEND MANDATE — a private on-ledger budget envelope a human
// principal granted the buyer agent. Only present when the app runs with TACIT_MANDATE_MODE=on
// (an additive, feature-flagged capability). Privacy: a mandate is signed by the principal
// and observed by the agent ONLY — the auditor is never a stakeholder, so this reflects the
// agent's OWN lawful read. isError when the flag is off or the ledger is unreachable.
server.registerTool(
  'tacit_mandate_status',
  {
    description:
      "The buyer agent's standing SPEND MANDATE: a private on-ledger budget envelope a human principal granted it. Returns remaining / limit / currency, the service scope, and any expiry. Every award authorizes its spend against this envelope in a separate Canton transaction, and the LEDGER refuses an over-budget award — an exhausted mandate is a real command failure, not a simulated one. Only available when the app runs with the spend-mandate feature on; isError otherwise. The auditor is never an observer of a mandate — this is the agent's own confidential read.",
    inputSchema: {},
    outputSchema: {
      enabled: z.boolean(),
      principalShort: z.string().nullable(),
      hasMandate: z.boolean(),
      label: z.string().nullable(),
      currency: z.string().nullable(),
      limit: z.number().nullable(),
      remaining: z.number().nullable(),
      allowedServices: z.array(z.string()),
      expiresAtUtc: z.string().nullable(),
    },
  },
  async () => {
    let data: any;
    try {
      const res = await fetchJson(`${APP_URL}/api/mandate/status`, {}, 10000);
      if (res.status === 404) {
        return { isError: true, content: [{ type: 'text' as const, text: 'Spend-mandate mode is OFF on this deployment — there is no standing mandate to read. (This is an additive, feature-flagged capability; enable TACIT_MANDATE_MODE=on to use it.)' }] };
      }
      if (!res.ok || res.json?.ok !== true) {
        return { isError: true, content: [{ type: 'text' as const, text: `Mandate status unavailable (no fabrication): ${res.json?.error || `HTTP ${res.status}`}` }] };
      }
      data = res.json;
    } catch (e) {
      return appDownResult(e);
    }
    const m = data.mandate || null;
    const principalShort = data.principal ? `${String(data.principal).slice(0, 12)}…` : null;
    const scope = m && Array.isArray(m.allowedServices) && m.allowedServices.length ? m.allowedServices.join(', ') : 'any registered service';
    const lines = m
      ? [
          `STANDING SPEND MANDATE — enforced on-ledger (Canton).`,
          `Remaining: ${m.remaining} of ${m.limit} ${m.currency}${principalShort ? ` · granted by ${principalShort}` : ''}`,
          `Scope: ${scope}${m.expiresAtUtc ? ` · expires ${String(m.expiresAtUtc).slice(0, 10)}` : ' · no expiry'}`,
          `Every award authorizes its spend against this envelope BEFORE the award; the ledger refuses an over-budget award. The auditor never sees this mandate.`,
        ]
      : ['No standing mandate is currently granted to this agent — a principal must grant one before it can spend.'];
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        enabled: true,
        principalShort,
        hasMandate: !!m,
        label: m ? String(m.label) : null,
        currency: m ? String(m.currency) : null,
        limit: m ? Number(m.limit) : null,
        remaining: m ? Number(m.remaining) : null,
        allowedServices: m && Array.isArray(m.allowedServices) ? m.allowedServices.map(String) : [],
        expiresAtUtc: m && m.expiresAtUtc ? String(m.expiresAtUtc) : null,
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
