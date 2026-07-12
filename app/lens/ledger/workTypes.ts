// Tacit Work — the shared response contract used by the API, the /work UI, the
// MCP tool, and the work preflight. One explicit shape so no surface silently
// accepts an incompatible response (see `schema`).

/** Bumped whenever the WorkResult shape changes in a breaking way. */
export const WORK_SCHEMA = 2;

export const WORK_PERSONAS = ['buyer', 'providerA', 'providerB', 'providerC', 'auditor'] as const;
export type Persona = (typeof WORK_PERSONAS)[number];

/** The real `site_audit` report the winning runner produces (see runner/src/audit.ts). */
export interface SiteAuditReport {
  service: 'site_audit';
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

export interface BidView {
  provider: string; // full party id
  providerLabel: string; // providerA | providerB | providerC
  contractId: string;
  price: number;
  winner: boolean;
}

/**
 * The delivered artifact. `available` is false on an idempotent replay after
 * Accept has archived the PrivateDelivery — the accepted bytes are NOT
 * reconstructed by the active-contract reader, and we never hash an empty
 * string and call that verification.
 */
export interface WorkArtifact {
  available: boolean;
  report: SiteAuditReport | null;
  sha256: string; // the on-ledger commitment (from delivery or receipt)
  byteLength: number;
  verifiedThisRequest: boolean; // true only when the buyer re-hashed the real bytes THIS request
}

export interface WorkEvidence {
  corePackageId: string;
  workPackageId: string;
  settlementContractId: string;
  paymentIouContractId?: string;
  assignmentContractId?: string;
  deliveryContractId?: string;
  receiptContractId: string;
}

export interface WorkResumption {
  resumed: boolean;
  /** True when this was a replay whose accepted report body could not be reloaded. */
  historicalArtifactNotLoaded: boolean;
}

/**
 * Per-persona ledger visibility, captured by real queries at each lifecycle
 * point (bids BEFORE Award archives them; delivery BEFORE Accept archives it).
 * `available` is false on a replay that cannot reproduce the pre-award state —
 * the /work lens must not manufacture it.
 */
export interface VisibilitySnapshot {
  available: boolean;
  personas: Persona[];
  /** bid contract ids each persona actually received (buyer sees all, each provider only its own, auditor none). */
  bids: Record<Persona, string[]>;
  activeWorkRequest: Record<Persona, boolean>;
  settlement: Record<Persona, boolean>;
  assignment: Record<Persona, boolean>;
  privateDelivery: Record<Persona, boolean>;
  receipt: Record<Persona, boolean>;
}

export interface WorkParties {
  buyer: string;
  providerA: string;
  providerB: string;
  providerC: string;
  auditor: string;
}

export interface WorkResult {
  ok: true;
  schema: number; // === WORK_SCHEMA
  mode: string; // "devnet"
  jobId: string;
  rfsId: string;
  workPackage: string;
  serviceType: string;
  buyerLabel: string; // display label only — the workflow acts as the pinned buyer party
  input: { url: string };
  parties: WorkParties;
  bids: BidView[]; // may be empty on a replay (bids archived)
  winner: { provider: string; providerLabel: string; price: number };
  amount: number;
  currency: 'USD.demo';
  artifact: WorkArtifact;
  evidence: WorkEvidence;
  resumption: WorkResumption;
  visibility: VisibilitySnapshot;
}

export interface WorkError {
  ok: false;
  error: string;
  schema?: number;
}

// ── /api/work/health ─────────────────────────────────────────────────────────
export interface RunnerHealth {
  ready: boolean;
  label: string;
  instanceId: string;
  pid: number;
  partyShort: string;
  ledgerMode: string;
}

export interface WorkHealth {
  ok: boolean;
  schema: number;
  mode: string;
  ledgerReachable: boolean;
  corePackage: { name: 'tacit'; shortId: string };
  workPackage: { name: 'tacit-work'; shortId: string };
  runners: RunnerHealth[];
  distinctInstances: boolean;
  distinctProcesses: boolean;
  /** Precise reason when ok === false, for the /work unavailable state. */
  reason?: string;
}

/** Empty per-persona map — small helper so callers don't repeat the shape. */
export function emptyPersonaMap<T>(value: T): Record<Persona, T> {
  return { buyer: value, providerA: value, providerB: value, providerC: value, auditor: value };
}
