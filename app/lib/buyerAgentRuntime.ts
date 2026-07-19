// Tacit Phase 2 — the BUYER AGENT RUNTIME: a stateful orchestrator over the tested pure core
// (schemas/gates → task planner → run machine → aggregation), backed by the durable journal. It is
// NOT a request/response handler: it holds a multi-task plan across events + restarts, runs each
// task via an INJECTED procure function (the real work.ts procurement), records structured decision
// events, and produces the final verified decision.
//
// The injected `procure` keeps the runtime testable and decoupled from the live (throttle-exposed)
// ledger — wiring it to `procureWork` is the deploy step, gated separately.
import { parseGoal } from '@/shared/agentCore';
import type { AgentDecisionEvent } from '@/shared/agentCore';
import { planTasks, type PlannerCost } from '@/shared/taskPlanner';
import { initRun, nextTask, applyResult, isComplete, finalize, remaining, type RunState, type TaskState, type FinalOutcome } from '@/shared/agentRun';
import * as journal from './agentJournal';

/** What one task procurement returns to the runtime (accepted only if the buyer verified it). */
export interface ProcureResult {
  accepted: boolean;
  decision: string | null; // policy decision for the verified report
  spent: number;
  refs: Record<string, string>; // ledger command / contract ids
  throttled?: boolean;
}
export type ProcureFn = (task: TaskState, budgetRemaining: number) => Promise<ProcureResult>;

// Estimated market floor per service — the buyer's private planning input (not a promise to providers).
const DEFAULT_COST: PlannerCost = { vendor_security_assessment: 25, web_performance_probe: 22 };
const nowIso = () => new Date().toISOString();

/** Create a run: gate the goal (injection-safe), plan tasks under the mandate, journal it. Returns
 *  the state + a human-approvable plan, or a refusal when the goal/budget is unusable. */
export async function createRun(
  agentRunId: string,
  goalRaw: unknown,
  mandateRemaining: number,
  opts: { cost?: PlannerCost; modelBacked?: boolean } = {},
): Promise<{ ok: true; state: RunState } | { ok: false; reason: string }> {
  const g = parseGoal(goalRaw, mandateRemaining);
  if (g.ok !== true) return { ok: false, reason: g.reason };
  const plan = planTasks(g.goal, opts.cost ?? DEFAULT_COST);
  const state = initRun(agentRunId, g.goal, plan);
  await journal.writeState(agentRunId, state);
  await emit(agentRunId, 0, {
    actor: 'buyer', kind: plan.insufficient ? 'plan_insufficient' : 'plan_proposed',
    reasonCodes: plan.insufficient ? ['insufficient_budget'] : plan.tasks.map((t) => t.taskId),
    budgetBefore: g.goal.totalBudget, budgetAfter: g.goal.totalBudget, modelBacked: !!opts.modelBacked,
  });
  return { ok: true, state };
}

/** Run the approved plan: pick → procure → verify → apply, journaling each structured decision, then
 *  aggregate. Resumes from journal state; a throttled task pauses truthfully instead of faking a result. */
export async function runApproved(agentRunId: string, procure: ProcureFn): Promise<{ outcome: FinalOutcome | null; paused: boolean; state: RunState }> {
  let s = (await journal.readState(agentRunId)) ?? null;
  if (!s) throw new Error(`no journaled run ${agentRunId}`);
  let seq = (await journal.readEvents(agentRunId)).length;
  s = { ...s, phase: 'running' };

  let guard = 0;
  while (!isComplete(s) && guard++ < 20) {
    const t = nextTask(s);
    if (!t) break;
    await emit(agentRunId, seq++, { actor: 'buyer', kind: 'task_started', taskId: t.taskId, reasonCodes: [t.serviceType], budgetBefore: remaining(s) });
    const r = await procure(t, remaining(s));
    if (r.throttled) {
      await emit(agentRunId, seq++, { actor: 'ledger', kind: 'task_paused_throttled', taskId: t.taskId, reasonCodes: ['ledger_write_throttled'] });
      await journal.writeState(agentRunId, s);
      return { outcome: null, paused: true, state: s };
    }
    s = applyResult(s, t.taskId, r);
    await journal.writeState(agentRunId, s);
    await emit(agentRunId, seq++, {
      actor: 'verifier', kind: r.accepted ? 'task_verified' : 'task_failed', taskId: t.taskId,
      reasonCodes: r.accepted ? ['verified', String(r.decision)] : ['verification_failed'],
      budgetAfter: remaining(s), refs: r.refs,
    });
  }

  const outcome = finalize(s);
  s = { ...s, phase: 'decided' };
  await journal.writeState(agentRunId, s);
  await emit(agentRunId, seq++, { actor: 'buyer', kind: 'decided', reasonCodes: [outcome.decision, ...outcome.reasonCodes], budgetAfter: outcome.remaining });
  return { outcome, paused: false, state: s };
}

async function emit(agentRunId: string, seq: number, e: Omit<AgentDecisionEvent, 'ts' | 'agentRunId' | 'seq'>): Promise<void> {
  await journal.appendEvent(agentRunId, { ts: nowIso(), agentRunId, seq, ...e });
}

/** Read the structured decision record for the Decision Room UI (no chain-of-thought). */
export async function runRecord(agentRunId: string): Promise<{ state: RunState | null; events: AgentDecisionEvent[] }> {
  return { state: await journal.readState(agentRunId), events: await journal.readEvents(agentRunId) };
}
