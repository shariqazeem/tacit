// Tacit Phase 2 — PURE buyer task planner. Turns a goal + total budget into a task GRAPH
// (which evidence to buy) and per-task ceilings, NEVER exceeding the human mandate. Deterministic
// (no randomness); the optional model step only nudges `goal.needs` upstream, behind the gate.
//
// Proof 1: the same goal at different budgets yields a different valid plan (or a truthful
// insufficiency). Proof 9: Σ per-task ceilings ≤ totalBudget ≤ mandate — the buyer cannot allocate
// beyond the human's boundary (and the ledger Authorize is the hard stop besides).

import type { AgentGoal, AgentServiceType, AgentTask, TaskPlan } from './agentCore';

export interface PlannerCost {
  vendor_security_assessment: number; // buyer's estimate of the going floor price
  web_performance_probe: number;
}
export interface PlannerOpts {
  contingencyRate?: number; // reserved for a possible replacement (default 0.15)
  headroom?: number;        // per-task ceiling = est × headroom (default 1.3)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic policy choice from the decision text — strict when the decision implies sensitivity. */
function policyFor(service: AgentServiceType, decision: string): string {
  const strict = /\b(strict|infrastructure|regulated|payment|checkout|financial|data|pii|compliance)\b/i.test(decision);
  if (service === 'vendor_security_assessment') return strict ? 'strict-infrastructure-v1' : 'standard-saas-v1';
  return strict ? 'latency-slo-strict-v1' : 'latency-slo-standard-v1';
}

/**
 * Build the task plan. Security is the anchor of a vendor-risk decision (required when needs are
 * unspecified); performance is included when explicitly requested OR when the budget comfortably
 * covers both. Optional tasks are dropped first when the budget is tight; if even the required set
 * can't be afforded at its floor cost, returns an honest `insufficient` plan.
 */
export function planTasks(goal: AgentGoal, cost: PlannerCost, opts: PlannerOpts = {}): TaskPlan {
  const total = goal.totalBudget;
  const contingencyRate = opts.contingencyRate ?? 0.15;
  const headroom = opts.headroom ?? 1.3;
  const contingency = round2(total * contingencyRate);
  const spendable = round2(total - contingency);

  const est: Record<AgentServiceType, number> = {
    vendor_security_assessment: cost.vendor_security_assessment,
    web_performance_probe: cost.web_performance_probe,
  };

  // Decide the WANTED evidence set (which dimensions), independent of budget.
  type Want = { serviceType: AgentServiceType; required: boolean };
  const wanted: Want[] = [];
  if (goal.needs.length === 0) {
    wanted.push({ serviceType: 'vendor_security_assessment', required: true }); // anchor
    wanted.push({ serviceType: 'web_performance_probe', required: false });     // affordability-gated
  } else {
    if (goal.needs.includes('security')) wanted.push({ serviceType: 'vendor_security_assessment', required: true });
    if (goal.needs.includes('performance')) wanted.push({ serviceType: 'web_performance_probe', required: true });
  }

  // Fit into `spendable`: drop optional tasks first; then shrink ceilings toward the floor.
  let items = wanted.map((w) => ({ ...w, est: est[w.serviceType], ceiling: round2(est[w.serviceType] * headroom) }));
  const sumCeil = (xs: typeof items) => round2(xs.reduce((s, i) => s + i.ceiling, 0));

  while (sumCeil(items) > spendable && items.some((i) => !i.required)) {
    // remove the last optional task
    for (let k = items.length - 1; k >= 0; k--) { if (!items[k].required) { items.splice(k, 1); break; } }
  }
  if (sumCeil(items) > spendable) {
    // shrink remaining (required) ceilings to their floor cost
    items = items.map((i) => ({ ...i, ceiling: i.est }));
  }
  if (items.length === 0 || sumCeil(items) > spendable) {
    const need = items.length ? round2(items.reduce((s, i) => s + i.est, 0)) : est.vendor_security_assessment;
    return {
      tasks: [], allocated: 0, contingency, totalBudget: total,
      insufficient: `budget of ${total} can't cover the required evidence (needs ≈ ${need} plus a ${Math.round(contingencyRate * 100)}% recovery reserve)`,
    };
  }

  const tasks: AgentTask[] = items.map((i, idx) => ({
    taskId: `t${idx + 1}-${i.serviceType === 'vendor_security_assessment' ? 'sec' : 'perf'}`,
    serviceType: i.serviceType,
    policyId: policyFor(i.serviceType, goal.decision),
    maxBudget: i.ceiling,
    required: i.required,
    reason:
      i.serviceType === 'vendor_security_assessment'
        ? 'Security posture is the anchor of a vendor-risk decision.'
        : i.required
          ? 'Performance evidence was explicitly requested.'
          : 'Budget covers a performance pre-screen alongside security.',
  }));

  return { tasks, allocated: sumCeil(items), contingency, totalBudget: total, insufficient: null };
}
