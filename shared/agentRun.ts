// Tacit Phase 2 — PURE buyer run state machine + decision aggregation. This is the stateful loop
// that makes the buyer a real agent (not a single request/response): it holds a multi-task plan,
// picks the next affordable task, applies each verified result, handles a failed task within the
// remaining budget, and aggregates only VERIFIED evidence into one final decision. Deterministic;
// the impure shell (journal file, procureWork calls, ledger reads) drives it.

import type { AgentGoal, TaskPlan } from './agentCore';

export type TaskStatus = 'pending' | 'procuring' | 'verified' | 'failed' | 'skipped';
export interface TaskState {
  taskId: string;
  serviceType: string;
  maxBudget: number;
  required: boolean;
  status: TaskStatus;
  spent: number;
  decision: string | null; // policy decision for this task's report (verified only)
  accepted: boolean;
  attempts: number;
}
export type RunPhase = 'planned' | 'running' | 'aggregating' | 'decided' | 'insufficient';
export interface RunState {
  agentRunId: string;
  goal: AgentGoal;
  totalBudget: number;
  tasks: TaskState[];
  phase: RunPhase;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_ATTEMPTS = 2; // one retry/replacement per task within budget

export function initRun(agentRunId: string, goal: AgentGoal, plan: TaskPlan): RunState {
  if (plan.insufficient) return { agentRunId, goal, totalBudget: goal.totalBudget, tasks: [], phase: 'insufficient' };
  const tasks: TaskState[] = plan.tasks.map((t) => ({
    taskId: t.taskId, serviceType: t.serviceType, maxBudget: t.maxBudget, required: t.required,
    status: 'pending', spent: 0, decision: null, accepted: false, attempts: 0,
  }));
  return { agentRunId, goal, totalBudget: goal.totalBudget, tasks, phase: 'planned' };
}

export const spent = (s: RunState): number => round2(s.tasks.reduce((a, t) => a + t.spent, 0));
export const remaining = (s: RunState): number => round2(s.totalBudget - spent(s));

/** The next task to procure: a pending task (or a retry of a failed one under MAX_ATTEMPTS) whose
 *  ceiling fits the remaining budget. Null when nothing more can be done. */
export function nextTask(s: RunState): TaskState | null {
  const rem = remaining(s);
  for (const t of s.tasks) {
    const eligible = t.status === 'pending' || (t.status === 'failed' && t.attempts < MAX_ATTEMPTS);
    if (eligible && t.maxBudget <= rem + 1e-9) return t;
  }
  return null;
}

/** Apply a procurement outcome to a task (verified → accepted; else failed, may retry). */
export function applyResult(s: RunState, taskId: string, r: { accepted: boolean; decision: string | null; spent: number }): RunState {
  const tasks = s.tasks.map((t) =>
    t.taskId === taskId
      ? { ...t, status: (r.accepted ? 'verified' : 'failed') as TaskStatus, accepted: r.accepted, decision: r.decision, spent: round2(t.spent + Math.max(0, r.spent)), attempts: t.attempts + 1 }
      : t,
  );
  return { ...s, tasks, phase: 'running' };
}

export const isComplete = (s: RunState): boolean => s.phase !== 'insufficient' && nextTask(s) === null;

// ── aggregation — combine only VERIFIED task decisions into one outcome ──
const SEVERITY: Record<string, number> = { approve: 0, approve_with_conditions: 1, human_review: 2, reject: 3 };
const LABEL: Record<number, string> = { 0: 'approve', 1: 'approve_with_conditions', 2: 'human_review', 3: 'reject' };

export interface FinalOutcome {
  decision: string; // approve | approve_with_conditions | human_review | reject
  reasonCodes: string[];
  verifiedTasks: number;
  failedRequired: number;
  totalSpent: number;
  remaining: number;
}

/**
 * Final decision: the MOST SEVERE decision across VERIFIED tasks. If any REQUIRED task could not be
 * verified/completed, force `human_review` (you cannot approve on missing evidence). Only verified
 * evidence contributes — a failed provider never silently upgrades a decision.
 */
export function finalize(s: RunState): FinalOutcome {
  const verified = s.tasks.filter((t) => t.status === 'verified' && t.decision);
  const failedRequired = s.tasks.filter((t) => t.required && t.status !== 'verified').length;
  const codes: string[] = [];
  let sev = 0;
  for (const t of verified) sev = Math.max(sev, SEVERITY[t.decision as string] ?? 2);
  if (verified.length === 0) { codes.push('no_verified_evidence'); return { decision: 'human_review', reasonCodes: codes, verifiedTasks: 0, failedRequired, totalSpent: spent(s), remaining: remaining(s) }; }
  if (failedRequired > 0) { sev = Math.max(sev, SEVERITY.human_review); codes.push('required_evidence_missing'); }
  codes.push(`verified_${verified.length}`);
  return { decision: LABEL[sev], reasonCodes: codes, verifiedTasks: verified.length, failedRequired, totalSpent: spent(s), remaining: remaining(s) };
}
