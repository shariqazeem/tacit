// /work UI types — re-exports the shared contract + small view-local helpers.
export type {
  WorkResult, WorkError, WorkHealth, RunnerHealth, SiteAuditReport,
  BidView, VisibilitySnapshot, WorkArtifact, WorkEvidence, Persona,
} from '../lens/ledger/workTypes';
export { WORK_SCHEMA, WORK_PERSONAS } from '../lens/ledger/workTypes';

export type WorkPhase = 'idle' | 'running' | 'success' | 'resumed' | 'error';

/** Persona display metadata for the Work Privacy Lens. */
export const PERSONA_META: Record<
  string,
  { label: string; role: string; glyph: string }
> = {
  buyer: { label: 'Buyer', role: 'Procures the work', glyph: '◆' },
  providerA: { label: 'Provider A', role: 'Sealed bidder', glyph: '▲' },
  providerB: { label: 'Provider B', role: 'Sealed bidder', glyph: '■' },
  providerC: { label: 'Provider C', role: 'Sealed bidder', glyph: '●' },
  auditor: { label: 'Auditor', role: 'Compliance, not surveillance', glyph: '⬡' },
};

/** A stored fresh response kept in sessionStorage for same-session restore. */
export interface StoredRun {
  jobId: string;
  url: string;
  maxBudget: number;
  result: import('../lens/ledger/workTypes').WorkResult;
  savedAtUtc: string;
}
