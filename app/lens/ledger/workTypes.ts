// Tacit Work — the shared response contract used by the API, the /work UI, the
// MCP tool, and the work preflight. One explicit shape so no surface silently
// accepts an incompatible response (see `schema`).

/** Bumped whenever the WorkResult shape changes in a breaking way. */
export const WORK_SCHEMA = 2;

export const WORK_PERSONAS = ['buyer', 'providerA', 'providerB', 'providerC', 'auditor'] as const;
export type Persona = (typeof WORK_PERSONAS)[number];

// Report types come from the shared registered-service contract (discriminated by
// `service` + `version`), so the app, MCP, runner and UI never diverge.
import type { ServiceReport, PolicyResult } from '@/shared/services';
export type { ServiceReport, SiteAuditReport, VendorSecurityAssessmentReport, PolicyResult } from '@/shared/services';

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
  report: ServiceReport | null;
  sha256: string; // the on-ledger commitment (alias of providerCommittedSha256; kept for compat)
  providerCommittedSha256: string; // the provider's on-ledger commitment
  buyerComputedSha256: string | null; // buyer's INDEPENDENT hash this request (null on resume)
  byteLength: number; // the provider's committed byte length
  providerCommittedByteLength: number;
  buyerComputedByteLength: number | null;
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
  /** On-ledger spend authorization (tacit-mandate). Present ONLY when TACIT_MANDATE_MODE=on. */
  mandateAuthorizationContractId?: string;
  /** Remaining on the mandate AFTER this spend. Present ONLY when the flag is on. */
  mandateRemaining?: number;
}

/**
 * Standing-mandate summary for the /work success view. Present ONLY when
 * TACIT_MANDATE_MODE=on — an OPTIONAL field, so with the flag off it is omitted
 * entirely and the serialized WorkResult is byte-for-byte today's shape.
 */
export interface WorkMandate {
  enabled: true;
  authorizationContractId: string;
  remainingAfter: number | null;
  packageId: string;
}

export interface WorkResumption {
  resumed: boolean;
  /** True when this was a replay whose accepted report body could not be reloaded. */
  historicalArtifactNotLoaded: boolean;
}

/** Buyer's deep acceptance verification — each check is independent and must pass. */
export interface BuyerVerification {
  hashOk: boolean;
  lengthOk: boolean;
  schemaOk: boolean;
  bindingOk: boolean;
  scoreOk: boolean;
  verified: boolean;
}

export interface AgentTraceEvent {
  step: string;
  detail: string;
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
  serviceVersion: number;
  requestSource: 'browser' | 'mcp' | 'console';
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
  buyerVerification: BuyerVerification;
  policy: PolicyResult | null;
  agentTrace: AgentTraceEvent[];
  visibility: VisibilitySnapshot;
  /** Standing-mandate summary — OPTIONAL; present only when TACIT_MANDATE_MODE=on. */
  mandate?: WorkMandate;
}

export interface WorkError {
  ok: false;
  error: string;
  schema?: number;
  /** Machine-readable failure class, e.g. 'LEDGER_WRITE_THROTTLED' | 'MANDATE_INSUFFICIENT'.
   *  Lets the UI/MCP render a specific designed state instead of a generic error. */
  reason?: string;
  /** True when retrying the SAME jobId is safe (nothing was started/spent). */
  retryable?: boolean;
}

// ── /api/work/health ─────────────────────────────────────────────────────────
export interface RunnerHealth {
  ready: boolean;
  label: string;
  instanceId: string;
  pid: number;
  partyShort: string;
  ledgerMode: string;
  services?: string[]; // advertised capabilities
  state?: string; // ready | busy | degraded | starting
}

export interface ServiceQuorum {
  supported: number; // distinct ready runners advertising this service
  quorum: boolean; // >= 3 distinct capable runners
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
  /** Per-service capability quorum (3 distinct ready runners advertising it). */
  serviceQuorum: Record<string, ServiceQuorum>;
  /** The default launch service id. */
  launchService: string;
  /** True when base readiness holds AND the launch service has a 3-runner quorum. */
  launchReady: boolean;
  /** Precise reason when ok === false OR launchReady === false. */
  reason?: string;
}

/** Empty per-persona map — small helper so callers don't repeat the shape. */
export function emptyPersonaMap<T>(value: T): Record<Persona, T> {
  return { buyer: value, providerA: value, providerB: value, providerC: value, auditor: value };
}
