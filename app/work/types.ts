// /work UI types — re-exports the shared contract + small view-local helpers.
export type {
  WorkResult, WorkError, WorkHealth, RunnerHealth, SiteAuditReport, VendorSecurityAssessmentReport,
  ServiceReport, BidView, VisibilitySnapshot, WorkArtifact, WorkEvidence, Persona,
  PolicyResult, BuyerVerification, AgentTraceEvent, ServiceQuorum,
} from '../lens/ledger/workTypes';
export { WORK_SCHEMA, WORK_PERSONAS } from '../lens/ledger/workTypes';

export type WorkPhase = 'idle' | 'running' | 'success' | 'resumed' | 'error';

/** Service display metadata (ids match shared/services SERVICE_IDS; legacy excluded). */
export const SERVICE_META: Record<string, { label: string; short: string; kicker: string; inputLabel: string; policyLabel: string; ctaLabel: string; runningLine: string; scope: string }> = {
  vendor_security_assessment: {
    label: 'Vendor security assessment', short: 'Security', kicker: 'Private vendor assessment',
    inputLabel: 'Vendor / API / MCP endpoint', policyLabel: 'Onboarding policy', ctaLabel: 'Assess this vendor →',
    runningLine: 'Winner is assessing the vendor’s public web-security posture — TLS, headers, DNS/mail and security.txt.',
    scope: 'a passive public web-security posture pre-screen — not a penetration test or certification',
  },
  web_performance_probe: {
    label: 'Web performance probe', short: 'Performance', kicker: 'Private performance probe',
    inputLabel: 'Public HTTPS endpoint', policyLabel: 'Latency policy', ctaLabel: 'Probe performance →',
    runningLine: 'Winner is running the performance probe — five fresh-connection samples against the target.',
    scope: 'a bounded performance pre-screen — not a load test or an availability guarantee',
  },
};
export const SERVICE_ORDER = ['vendor_security_assessment', 'web_performance_probe'];

/** Onboarding policy display metadata, SERVICE-SCOPED (ids match shared/services). */
export const POLICY_BY_SERVICE: Record<string, { id: string; label: string; hint: string }[]> = {
  vendor_security_assessment: [
    { id: 'standard-saas-v1', label: 'Standard SaaS', hint: 'Balanced onboarding for typical SaaS vendors.' },
    { id: 'strict-infrastructure-v1', label: 'Strict infrastructure', hint: 'Stricter thresholds for infrastructure / data processors.' },
  ],
  web_performance_probe: [
    { id: 'latency-slo-standard-v1', label: 'Standard latency SLO', hint: 'Balanced latency SLO for a public endpoint.' },
    { id: 'latency-slo-strict-v1', label: 'Strict latency SLO', hint: 'Stricter latency SLO for latency-sensitive endpoints.' },
  ],
};
/** All policies (for lookups). */
export const POLICY_META = [...POLICY_BY_SERVICE.vendor_security_assessment, ...POLICY_BY_SERVICE.web_performance_probe];

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
