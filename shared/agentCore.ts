// Tacit Phase 2 — PURE agent core: schemas, injection-resistant gates, evidence verify.
// Browser + node safe, no I/O. The impure runtime (journal, ledger, model calls) wraps these.
//
// SAFETY: model output and user goal text are UNTRUSTED. Every parser extracts ONLY whitelisted
// fields and clamps to the human mandate — it can never set a party, a tool allowlist, a privacy
// rule, an award policy, or a ledger command. Authority comes from the mandate + registry, never
// from a string the model produced.

export const AGENT_SERVICES = ['vendor_security_assessment', 'web_performance_probe'] as const;
export type AgentServiceType = (typeof AGENT_SERVICES)[number];
export type EvidenceNeed = 'security' | 'performance';

/** The buyer's structured goal — the ONLY authority the model contributes is intent, never money/identity. */
export interface AgentGoal {
  decision: string;            // e.g. "approve vendor.com for our checkout stack"
  target: string;              // an https:// URL (validated by the registry, not here)
  needs: EvidenceNeed[];       // requested evidence dimensions ([] = let the planner choose)
  totalBudget: number;         // clamped to the mandate remaining — the hard ceiling
  privacy: 'team-and-specialists';
  deadlineSec: number | null;
}

/** One unit of work the buyer decides to buy — maps to exactly one real procurement. */
export interface AgentTask {
  taskId: string;
  serviceType: AgentServiceType;
  policyId: string;
  maxBudget: number;           // per-task ceiling; Σ ≤ totalBudget
  reason: string;              // concise why-selected (not chain-of-thought)
  required: boolean;
}

export interface TaskPlan {
  tasks: AgentTask[];
  allocated: number;
  contingency: number;
  totalBudget: number;
  insufficient: string | null; // set when even the minimum viable task can't be afforded
}

export type ProviderVerdict = 'BID' | 'DECLINE' | 'NEED_CLARIFICATION';
export interface ProviderPolicy {
  providerId: string;
  capabilities: AgentServiceType[];  // what it can actually do
  capacity: number;                  // max concurrent in-flight it will accept
  minMargin: number;                 // floor margin below which it declines
  baseCost: number;
  serviceCost: Record<string, number>;
}
export interface ProviderDecision {
  verdict: ProviderVerdict;
  price: number | null;
  etaSec: number | null;
  reasonCode: string; // 'ok' | 'unsupported_service' | 'capacity_full' | 'below_min_margin' | 'need_target' | 'budget_too_low'
}

/** Structured decision record — NEVER chain-of-thought. */
export interface AgentDecisionEvent {
  ts: string;
  agentRunId: string;
  seq: number;
  actor: 'buyer' | 'provider' | 'ledger' | 'verifier';
  kind: string;
  taskId?: string;
  reasonCodes: string[];
  budgetBefore?: number;
  budgetAfter?: number;
  refs?: Record<string, string>;
  modelBacked?: boolean;
}

// ── injection-resistant gates ────────────────────────────────────────────────

const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
};

const HTTPS_RE = /^https:\/\/[^\s"'<>]{1,2048}$/i;

/**
 * Parse a GOAL candidate (from the model or a manual form) into a safe AgentGoal.
 * WHITELIST-ONLY: reads decision/target/needs/totalBudget/deadline; ignores every other key
 * (party, tool allowlist, privacy override, ledger command, policy id injection). totalBudget is
 * hard-clamped to `mandateRemaining`. Returns {ok:false} on an unusable target/decision.
 */
export function parseGoal(
  raw: unknown,
  mandateRemaining: number,
  opts: { maxBudgetCeiling?: number } = {},
): { ok: true; goal: AgentGoal } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'goal is not an object' };
  const o = raw as Record<string, unknown>;
  const decision = typeof o.decision === 'string' ? o.decision.trim().slice(0, 240) : '';
  if (decision.length < 3) return { ok: false, reason: 'missing a decision to make' };
  const target = typeof o.target === 'string' ? o.target.trim() : '';
  if (!HTTPS_RE.test(target)) return { ok: false, reason: 'target must be an https:// URL the user named' };
  // needs: only the two known dimensions survive; anything else is dropped.
  const rawNeeds = Array.isArray(o.needs) ? o.needs : [];
  const needs = Array.from(new Set(rawNeeds.map(String).filter((n): n is EvidenceNeed => n === 'security' || n === 'performance')));
  const ceiling = opts.maxBudgetCeiling ?? 10000;
  // totalBudget is clamped to BOTH a hard ceiling and the mandate — the model can never raise it.
  const asked = clampNum(o.totalBudget, 1, ceiling, 25);
  const totalBudget = Math.min(asked, Math.max(0, mandateRemaining));
  if (totalBudget < 1) return { ok: false, reason: 'no budget available under the mandate' };
  const deadlineSec = o.deadlineSec == null ? null : clampNum(o.deadlineSec, 5, 3600, 300);
  return { ok: true, goal: { decision, target, needs, totalBudget, privacy: 'team-and-specialists', deadlineSec } };
}

/**
 * Parse a model-produced TASK-SELECTION into a safe shape. The model only chooses WHICH dimensions
 * to run and rough priority — never budgets, parties, tools, or policies. Returns the sanitized set
 * of requested needs; unknown values are dropped, empty ⇒ planner default applies.
 */
export function parseModelTaskSelection(raw: unknown): { needs: EvidenceNeed[]; note: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = Array.isArray(o.needs) ? o.needs : Array.isArray(o.tasks) ? o.tasks : [];
  const needs = Array.from(new Set(arr.map(String).map((s) => s.toLowerCase()).filter((n): n is EvidenceNeed => n === 'security' || n === 'performance')));
  const note = typeof o.note === 'string' ? o.note.slice(0, 160) : '';
  return { needs, note };
}

/** Independent verifier gate: an artifact is accepted ONLY if the buyer-recomputed digest + length
 *  match the provider's on-ledger commitment. Pure — mirrors the frozen buyer verification. */
export function verifyEvidence(args: {
  providerCommittedSha256: string;
  buyerComputedSha256: string | null;
  committedByteLength: number;
  buyerComputedByteLength: number | null;
  schemaOk: boolean;
  scoreOk: boolean;
}): { accepted: boolean; reasonCodes: string[] } {
  const codes: string[] = [];
  const hashOk = !!args.buyerComputedSha256 && args.buyerComputedSha256 === args.providerCommittedSha256;
  const lenOk = args.buyerComputedByteLength != null && args.buyerComputedByteLength === args.committedByteLength;
  if (!hashOk) codes.push('digest_mismatch');
  if (!lenOk) codes.push('length_mismatch');
  if (!args.schemaOk) codes.push('schema_invalid');
  if (!args.scoreOk) codes.push('score_mismatch');
  const accepted = hashOk && lenOk && args.schemaOk && args.scoreOk;
  return { accepted, reasonCodes: accepted ? ['verified'] : codes };
}

/** Stable idempotency key for a ledger write — derived from run/task/action/policy. No randomness. */
export function idempotencyKey(agentRunId: string, taskId: string, action: string, policyVersion: string): string {
  return `${agentRunId}:${taskId}:${action}:${policyVersion}`;
}
