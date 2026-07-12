// Tacit — authoritative registered-service contract.
//
// PURE TypeScript: no node/next imports, no execution code, no provider policy.
// Shared by the app (API + UI), the MCP server, and the provider runner (copied to
// runner/src/_shared.ts at build time). Browser-safe — schemas, validators, canonical
// input and PUBLIC capability metadata only. The actual network execution lives in
// runner-only adapters and never enters this file or the browser bundle.

// ── utf-8 byte length (browser + node safe; no Buffer) ──────────────────────
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

// ── canonical helper (sorted-key JSON; deterministic) ───────────────────────
export function canonicalize(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw new Error('cannot canonicalize a cycle');
    seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}

// ── service ids ─────────────────────────────────────────────────────────────
export const VENDOR_SERVICE = 'vendor_security_assessment';
export const LEGACY_SITE_AUDIT = 'site_audit';
export const SERVICE_IDS = [VENDOR_SERVICE, LEGACY_SITE_AUDIT] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

// ── input types ─────────────────────────────────────────────────────────────
export interface UrlServiceInput {
  url: string;
}

const MAX_URL_LEN = 2048;
/** Shared https-URL validator (no credentials/fragment; length-bounded). SSRF/IP
 *  resolution checks are enforced separately in the runner's network layer. */
export function validateHttpsUrl(raw: unknown): Validation<UrlServiceInput> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'input must be an object' };
  const url = (raw as any).url;
  if (typeof url !== 'string') return { ok: false, error: 'input.url must be a string' };
  if (url.length < 8 || url.length > MAX_URL_LEN) return { ok: false, error: `input.url length out of range` };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: 'input.url is not a valid URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'input.url must use https://' };
  if (u.username || u.password) return { ok: false, error: 'input.url must not contain credentials' };
  if (u.port && u.port !== '443') return { ok: false, error: 'only port 443 is allowed' };
  if (!u.hostname || u.hostname.length > 253 || !u.hostname.includes('.')) return { ok: false, error: 'input.url has an invalid host' };
  // First-line SSRF defense (the runner's network layer still does full DNS-resolution
  // checks + IP pinning): reject IP-literal + loopback hosts syntactically.
  const host = u.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return { ok: false, error: 'IP-literal hosts are not allowed' };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return { ok: false, error: 'loopback hosts are not allowed' };
  return { ok: true, value: { url } };
}

// ── report types (discriminated union by service + version) ──────────────────
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  evidence: string;
  remediation: string;
}

export interface ScoringContribution {
  key: string;
  label: string;
  points: number; // signed contribution
  observed: string;
}

/** The production launch service report. Filled by the runner adapter in Phase 2. */
export interface VendorSecurityAssessmentReport {
  service: typeof VENDOR_SERVICE;
  version: 1;
  methodologyVersion: string;
  scoringVersion: string;
  requestedUrl: string;
  finalUrl: string;
  hostname: string;
  pageTitle: string | null;
  assessmentStartedAtUtc: string;
  assessmentEndedAtUtc: string;
  durationMs: number;
  httpStatus: number;
  redirectChain: string[];
  contentType: string | null;
  sampledByteLength: number;
  tls: {
    ok: boolean;
    protocol: string | null;
    authorized: boolean;
    certIssuer: string | null;
    certSubject: string | null;
    validFromUtc: string | null;
    validToUtc: string | null;
    daysRemaining: number | null;
    hostnameMatch: boolean | null;
    error?: string;
  };
  securityHeaders: Record<string, { present: boolean; value: string | null }>;
  cookies: { count: number; secure: number; httpOnly: number; sameSite: number };
  dns: {
    caa: 'present' | 'absent' | 'unavailable';
    mx: 'present' | 'absent' | 'unavailable';
    spf: 'present' | 'absent' | 'unavailable';
    dmarc: 'present' | 'absent' | 'unavailable';
  };
  securityTxt: { status: 'present' | 'absent' | 'unavailable'; httpStatus: number | null };
  findings: Finding[];
  score: number;
  riskBand: 'strong' | 'adequate' | 'weak' | 'critical';
  scoringBreakdown: ScoringContribution[];
  limitations: string;
}

/** Legacy service report (unchanged shape from the shipped site_audit adapter). */
export interface SiteAuditReport {
  service: typeof LEGACY_SITE_AUDIT;
  version: number;
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  responseLatencyMs: number;
  contentType: string | null;
  sampledByteLength: number;
  pageTitle: string | null;
  https: boolean;
  securityHeaders: Record<string, boolean>;
  findings: string[];
  score: number;
  auditedAtUtc: string;
}

export type ServiceReport = VendorSecurityAssessmentReport | SiteAuditReport;

// ── result summary (safe for MCP/UI) ─────────────────────────────────────────
export interface ResultSummary {
  service: ServiceId;
  title: string;
  score: number;
  riskBand: string;
  headline: string;
  topFindings: { severity: Severity; title: string }[];
}

// ── public metadata (no policy, no internals) ────────────────────────────────
export interface InputField {
  name: string;
  label: string;
  type: 'https-url';
  required: boolean;
}

export interface PublicServiceMeta {
  id: ServiceId;
  name: string;
  description: string;
  version: number;
  methodologyVersion?: string;
  inputFields: InputField[];
  legacy: boolean;
}

// ── descriptor ────────────────────────────────────────────────────────────────
export interface ServiceDescriptor {
  id: ServiceId;
  name: string;
  description: string;
  version: number;
  methodologyVersion?: string;
  legacy: boolean;
  inputFields: InputField[];
  validateInput(raw: unknown): Validation<UrlServiceInput>;
  /** Canonical serviceInput JSON bound to the ActiveWorkRequest. */
  canonicalInput(input: UrlServiceInput): string;
  /** Deterministic complexity signals for pricing — reveals NO provider policy. */
  complexitySignals(input: UrlServiceInput): { inputBytes: number };
  /** Strict structural report validator (schema + service/version match). */
  validateReport(report: unknown): Validation<ServiceReport>;
  /** Bind a report to the request that produced it (target/service/version). */
  bindsToRequest(report: ServiceReport, input: UrlServiceInput): Validation<true>;
  /** Safe summary for MCP/UI. */
  summarize(report: ServiceReport): ResultSummary;
  publicMeta(): PublicServiceMeta;
}

const URL_INPUT_FIELDS: InputField[] = [{ name: 'url', label: 'Vendor / API / MCP endpoint (https)', type: 'https-url', required: true }];

function normHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// ── vendor_security_assessment descriptor ────────────────────────────────────
const vendorDescriptor: ServiceDescriptor = {
  id: VENDOR_SERVICE,
  name: 'Vendor security assessment',
  description: 'Passive public web-security posture pre-screen for vendor onboarding (TLS, headers, cookies, DNS/mail, security.txt). Not a penetration test or certification.',
  version: 1,
  methodologyVersion: 'vsa-1.0',
  legacy: false,
  inputFields: URL_INPUT_FIELDS,
  validateInput: validateHttpsUrl,
  canonicalInput: (input) => canonicalize({ url: input.url }),
  complexitySignals: (input) => ({ inputBytes: utf8Bytes(canonicalize({ url: input.url })) }),
  validateReport(report) {
    const e = (m: string): Validation<ServiceReport> => ({ ok: false, error: `vendor report: ${m}` });
    if (typeof report !== 'object' || report === null) return e('not an object');
    const r = report as any;
    if (r.service !== VENDOR_SERVICE) return e('wrong service');
    if (r.version !== 1) return e('unsupported version');
    for (const k of ['requestedUrl', 'finalUrl', 'hostname', 'assessmentStartedAtUtc', 'assessmentEndedAtUtc', 'methodologyVersion', 'scoringVersion', 'limitations']) {
      if (typeof r[k] !== 'string') return e(`missing string ${k}`);
    }
    if (typeof r.httpStatus !== 'number' || typeof r.durationMs !== 'number') return e('missing numeric fields');
    if (!r.tls || typeof r.tls !== 'object') return e('missing tls');
    if (!r.securityHeaders || typeof r.securityHeaders !== 'object') return e('missing securityHeaders');
    if (!r.cookies || typeof r.cookies !== 'object') return e('missing cookies');
    if (!r.dns || typeof r.dns !== 'object') return e('missing dns');
    if (!r.securityTxt || typeof r.securityTxt !== 'object') return e('missing securityTxt');
    if (!Array.isArray(r.findings)) return e('findings must be an array');
    for (const f of r.findings) {
      if (!f || typeof f.id !== 'string' || typeof f.title !== 'string' || !['critical', 'high', 'medium', 'low', 'info'].includes(f.severity)) return e('malformed finding');
    }
    if (typeof r.score !== 'number' || r.score < 0 || r.score > 100) return e('score out of range');
    if (!['strong', 'adequate', 'weak', 'critical'].includes(r.riskBand)) return e('invalid riskBand');
    if (!Array.isArray(r.scoringBreakdown) || r.scoringBreakdown.length === 0) return e('missing scoringBreakdown');
    return { ok: true, value: r as VendorSecurityAssessmentReport };
  },
  bindsToRequest(report, input) {
    const r = report as VendorSecurityAssessmentReport;
    if (r.service !== VENDOR_SERVICE) return { ok: false, error: 'service mismatch' };
    if (r.requestedUrl !== input.url) return { ok: false, error: 'requestedUrl does not match the work request' };
    if (normHost(r.finalUrl) && normHost(input.url) && normHost(r.finalUrl).split('.').slice(-2).join('.') !== normHost(input.url).split('.').slice(-2).join('.')) {
      return { ok: false, error: 'final host is not within the requested registrable domain' };
    }
    return { ok: true, value: true };
  },
  summarize(report) {
    const r = report as VendorSecurityAssessmentReport;
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const top = [...r.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, 3);
    return {
      service: VENDOR_SERVICE,
      title: r.pageTitle || r.hostname,
      score: r.score,
      riskBand: r.riskBand,
      headline: `${r.riskBand} posture · score ${r.score}/100 · ${r.findings.length} finding(s)`,
      topFindings: top.map((f) => ({ severity: f.severity, title: f.title })),
    };
  },
  publicMeta() {
    return { id: this.id, name: this.name, description: this.description, version: this.version, methodologyVersion: this.methodologyVersion, inputFields: this.inputFields, legacy: false };
  },
};

// ── legacy site_audit descriptor (compatibility only) ────────────────────────
const siteAuditDescriptor: ServiceDescriptor = {
  id: LEGACY_SITE_AUDIT,
  name: 'Website audit (legacy)',
  description: 'Legacy shallow website header/status audit. Retained for historical job resumption and backward compatibility.',
  version: 1,
  legacy: true,
  inputFields: URL_INPUT_FIELDS,
  validateInput: validateHttpsUrl,
  canonicalInput: (input) => canonicalize({ url: input.url }),
  complexitySignals: (input) => ({ inputBytes: utf8Bytes(canonicalize({ url: input.url })) }),
  validateReport(report) {
    if (typeof report !== 'object' || report === null) return { ok: false, error: 'site_audit report: not an object' };
    const r = report as any;
    if (r.service !== LEGACY_SITE_AUDIT) return { ok: false, error: 'site_audit report: wrong service' };
    if (typeof r.requestedUrl !== 'string' || typeof r.httpStatus !== 'number') return { ok: false, error: 'site_audit report: missing fields' };
    return { ok: true, value: r as SiteAuditReport };
  },
  bindsToRequest(report, input) {
    const r = report as SiteAuditReport;
    return r.requestedUrl === input.url ? { ok: true, value: true } : { ok: false, error: 'requestedUrl mismatch' };
  },
  summarize(report) {
    const r = report as SiteAuditReport;
    return { service: LEGACY_SITE_AUDIT, title: r.pageTitle || r.finalUrl, score: r.score, riskBand: 'n/a', headline: `site_audit · score ${r.score}`, topFindings: (r.findings || []).slice(0, 3).map((f) => ({ severity: 'info' as Severity, title: f })) };
  },
  publicMeta() {
    return { id: this.id, name: this.name, description: this.description, version: this.version, inputFields: this.inputFields, legacy: true };
  },
};

// ── registry ──────────────────────────────────────────────────────────────────
export const SERVICE_REGISTRY: Record<ServiceId, ServiceDescriptor> = {
  [VENDOR_SERVICE]: vendorDescriptor,
  [LEGACY_SITE_AUDIT]: siteAuditDescriptor,
};

/** The default service for NEW procurements. */
export const DEFAULT_SERVICE: ServiceId = VENDOR_SERVICE;

export function getService(id: string): ServiceDescriptor | undefined {
  return (SERVICE_REGISTRY as Record<string, ServiceDescriptor>)[id];
}
export function isRegisteredService(id: string): id is ServiceId {
  return id === VENDOR_SERVICE || id === LEGACY_SITE_AUDIT;
}
/** Public metadata for /api/work/services (availability is layered on at runtime). */
export function listPublicServices(): PublicServiceMeta[] {
  return SERVICE_IDS.map((id) => SERVICE_REGISTRY[id].publicMeta());
}

// ── deterministic buyer policy engine (no LLM; fully inspectable) ─────────────
export type PolicyId = 'standard-saas-v1' | 'strict-infrastructure-v1';
export const POLICY_IDS: PolicyId[] = ['standard-saas-v1', 'strict-infrastructure-v1'];
export type PolicyDecision = 'approve' | 'approve_with_conditions' | 'human_review' | 'reject';

export interface PolicyResult {
  policyId: PolicyId;
  policyVersion: string;
  decision: PolicyDecision;
  reasonCodes: string[]; // tied to real findings/score
  requiredActions: { findingId: string; action: string }[];
  decidedAtUtc: string;
  statement: string;
  scoreConsidered: number;
  riskBandConsidered: string;
}

const POLICY_VERSION = '1.0';
const STATEMENT = 'This is an automated technical pre-screen of public web-security posture — not a security certification, penetration test, or guarantee.';

/** Deterministic onboarding decision from a VERIFIED vendor report. Never invents
 *  facts; every reason code references an observed finding or the computed score. */
export function evaluatePolicy(policyId: PolicyId, report: VendorSecurityAssessmentReport, decidedAtUtc: string): PolicyResult {
  const findings = report.findings || [];
  const has = (sev: Severity) => findings.some((f) => f.severity === sev);
  const criticals = findings.filter((f) => f.severity === 'critical');
  const highs = findings.filter((f) => f.severity === 'high');
  const conditionable = findings.filter((f) => f.severity === 'high' || f.severity === 'medium');
  const reasonCodes: string[] = [];
  const requiredActions = conditionable.map((f) => ({ findingId: f.id, action: f.remediation }));
  const score = report.score;

  const strict = policyId === 'strict-infrastructure-v1';
  let decision: PolicyDecision;

  if (criticals.length || report.riskBand === 'critical') {
    // A critical transport/identity failure can NEVER approve.
    decision = strict ? 'reject' : 'human_review';
    reasonCodes.push(...criticals.map((f) => `critical:${f.id}`));
    if (!criticals.length) reasonCodes.push('critical:risk_band');
  } else if (strict) {
    if (highs.length) { decision = 'human_review'; reasonCodes.push(...highs.map((f) => `high:${f.id}`)); }
    else if (score >= 90 && !has('medium')) { decision = 'approve'; reasonCodes.push(`score:${score}`); }
    else if (score >= 75) { decision = 'approve_with_conditions'; reasonCodes.push(`score:${score}`, ...conditionable.map((f) => `condition:${f.id}`)); }
    else if (score >= 50) { decision = 'human_review'; reasonCodes.push(`score:${score}`); }
    else { decision = 'reject'; reasonCodes.push(`score:${score}`); }
  } else {
    if (highs.length && score < 65) { decision = 'human_review'; reasonCodes.push(...highs.map((f) => `high:${f.id}`)); }
    else if (score >= 85 && !highs.length) { decision = 'approve'; reasonCodes.push(`score:${score}`); }
    else if (score >= 65) { decision = 'approve_with_conditions'; reasonCodes.push(`score:${score}`, ...conditionable.map((f) => `condition:${f.id}`)); }
    else if (score >= 40) { decision = 'human_review'; reasonCodes.push(`score:${score}`); }
    else { decision = 'reject'; reasonCodes.push(`score:${score}`); }
  }

  return {
    policyId, policyVersion: POLICY_VERSION, decision,
    reasonCodes, requiredActions, decidedAtUtc, statement: STATEMENT,
    scoreConsidered: score, riskBandConsidered: report.riskBand,
  };
}

// ── Buyer Agent Console: plan validation (pure; the HARD gate) ───────────────
// The LLM only PROPOSES a mandate from a natural-language goal. This validator is
// the security boundary: it re-checks everything against the registry regardless
// of what the model returned, and fails closed. Nothing here spends anything.
export const PLAN_BUDGET_MIN = 1;
export const PLAN_BUDGET_MAX = 10000;

export interface AgentProposal {
  serviceType: ServiceId;
  input: { url: string };
  policyId: PolicyId;
  maxBudget: number;
  confidence: number | null; // 0..1 or null
  assumptions: string[];
}

export type PlanValidation = { ok: true; proposal: AgentProposal } | { ok: false; reason: string };

/**
 * Validate a model-proposed mandate. `isAvailable(serviceId)` reports the live
 * 3-runner capability quorum (passed in so this stays pure + testable). Legacy
 * services are never offered to new mandates.
 */
export function validateAgentPlan(raw: unknown, isAvailable: (serviceId: string) => boolean): PlanValidation {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'the planner did not return a JSON object' };
  const r = raw as any;

  const serviceType = typeof r.serviceType === 'string' ? r.serviceType.trim() : '';
  const svc = getService(serviceType);
  if (!svc) return { ok: false, reason: `unsupported service "${serviceType || '?'}" — only vendor_security_assessment is offered` };
  if (svc.legacy) return { ok: false, reason: `"${serviceType}" is a legacy service and is not offered to new mandates` };

  const inputVal = svc.validateInput(r.input);
  if (inputVal.ok !== true) return { ok: false, reason: inputVal.error };

  const policyId = typeof r.policyId === 'string' ? r.policyId.trim() : '';
  if (!(POLICY_IDS as string[]).includes(policyId)) return { ok: false, reason: `unknown policy "${policyId || '?'}"` };

  const budget = Number(r.maxBudget);
  if (!Number.isFinite(budget) || budget < PLAN_BUDGET_MIN || budget > PLAN_BUDGET_MAX) {
    return { ok: false, reason: `budget must be ${PLAN_BUDGET_MIN}–${PLAN_BUDGET_MAX} demo credits (got ${r.maxBudget})` };
  }

  if (!isAvailable(serviceType)) return { ok: false, reason: `${serviceType} is not ready right now (needs 3 live provider agents)` };

  const confidence = Number.isFinite(Number(r.confidence)) ? Math.max(0, Math.min(1, Number(r.confidence))) : null;
  const assumptions = Array.isArray(r.assumptions)
    ? r.assumptions.filter((a: any) => typeof a === 'string' && a.trim()).slice(0, 6).map((a: string) => a.trim().slice(0, 200))
    : [];

  return {
    ok: true,
    proposal: { serviceType: serviceType as ServiceId, input: { url: inputVal.value.url }, policyId: policyId as PolicyId, maxBudget: Math.round(budget), confidence, assumptions },
  };
}
