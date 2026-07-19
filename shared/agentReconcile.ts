// Tacit Phase 2 — PURE reconciliation. On restart, the buyer runtime rebuilds its position from
// LEDGER TRUTH (which task-jobs reached which lifecycle stage) + its journal (the intended plan).
// This decides, per task, whether it is done, must resume in place, or must start fresh — so a
// crash-restart never re-opens a request or double-spends.
//
// Proof 5: kill after a ledger write → restart → a task already OPENED/AWARDED resumes (never
// re-starts), a RECEIPTED task is skipped, and spend is re-derived from settlements (not the journal),
// so the mandate is honoured across restarts.

export type TaskLedgerStage = 'none' | 'opened' | 'awarded' | 'delivered' | 'receipted';

export interface ReconcileInput {
  plannedTaskIds: string[];
  ledgerStage: Record<string, TaskLedgerStage>; // per taskId, the furthest stage seen on-ledger
}
export interface ReconcilePlan {
  done: string[];   // receipted → skip (already complete)
  resume: string[]; // opened/awarded/delivered → continue WITHOUT re-opening
  start: string[];  // none → open fresh
}

/** Classify each planned task from live ledger stage. A task is never both started and resumed. */
export function reconcile(input: ReconcileInput): ReconcilePlan {
  const done: string[] = [];
  const resume: string[] = [];
  const start: string[] = [];
  for (const t of input.plannedTaskIds) {
    const s = input.ledgerStage[t] || 'none';
    if (s === 'receipted') done.push(t);
    else if (s === 'none') start.push(t);
    else resume.push(t); // opened | awarded | delivered
  }
  return { done, resume, start };
}

/** Spend is re-derived from LEDGER settlements (the source of truth), never the journal — so a
 *  restart cannot lose track of money already moved. Returns the total actually settled. */
export function spentFromSettlements(settlements: { amount: number }[]): number {
  const total = settlements.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  return Math.round(total * 100) / 100;
}

/** Remaining budget after reconciliation — clamped at 0. The buyer may only start/replace tasks that
 *  fit in what's left, so the human mandate holds across crashes. */
export function remainingBudget(totalBudget: number, settlements: { amount: number }[]): number {
  return Math.max(0, Math.round((totalBudget - spentFromSettlements(settlements)) * 100) / 100);
}
