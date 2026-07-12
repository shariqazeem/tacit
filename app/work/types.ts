// /work UI types — re-exports the shared contract + small view-local helpers.
export type {
  WorkResult, WorkError, WorkHealth, RunnerHealth, SiteAuditReport, VendorSecurityAssessmentReport,
  ServiceReport, BidView, VisibilitySnapshot, WorkArtifact, WorkEvidence, Persona,
  PolicyResult, BuyerVerification, AgentTraceEvent, ServiceQuorum,
} from '../lens/ledger/workTypes';
export { WORK_SCHEMA, WORK_PERSONAS } from '../lens/ledger/workTypes';

export type WorkPhase = 'idle' | 'running' | 'success' | 'resumed' | 'error';

/** Onboarding policy display metadata (ids match shared/services POLICY_IDS). */
export const POLICY_META: { id: string; label: string; hint: string }[] = [
  { id: 'standard-saas-v1', label: 'Standard SaaS', hint: 'Balanced onboarding for typical SaaS vendors.' },
  { id: 'strict-infrastructure-v1', label: 'Strict infrastructure', hint: 'Stricter thresholds for infrastructure / data processors.' },
];

/** Onboarding decision display metadata. */
export const DECISION_META: Record<string, { label: string; tone: 'good' | 'warn' | 'review' | 'bad' }> = {
  approve: { label: 'Approved', tone: 'good' },
  approve_with_conditions: { label: 'Approved with conditions', tone: 'warn' },
  human_review: { label: 'Human review required', tone: 'review' },
  reject: { label: 'Rejected', tone: 'bad' },
};

export const SEVERITY_TONE: Record<string, string> = {
  critical: '#B91C1C', high: '#B45309', medium: '#B45309', low: '#0D9488', info: 'rgba(10,10,11,0.5)',
};

export const PERSONA_META: Record<string, { label: string; role: string; glyph: string }> = {
  buyer: { label: 'Buyer', role: 'Procurement agent', glyph: '◆' },
  providerA: { label: 'Provider A', role: 'Assessor agent', glyph: '▲' },
  providerB: { label: 'Provider B', role: 'Assessor agent', glyph: '■' },
  providerC: { label: 'Provider C', role: 'Assessor agent', glyph: '●' },
  auditor: { label: 'Auditor', role: 'Compliance, not surveillance', glyph: '⬡' },
};

export interface StoredRun {
  jobId: string;
  url: string;
  maxBudget: number;
  policyId: string;
  result: import('../lens/ledger/workTypes').WorkResult;
  savedAtUtc: string;
}
