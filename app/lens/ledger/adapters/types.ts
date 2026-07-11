// Tacit — the ledger adapter contract.
//
// One interface, three targets (see config.ts → LedgerMode):
//   • sandbox        → sandboxV1  (Daml 2.x v1 HTTP JSON API + dev HS256 JWT)
//   • canton3-local  → cantonV2   (Canton 3.x v2 JSON Ledger API, auth off/static)
//   • devnet         → cantonV2   (same code, OAuth2 client-credentials + real endpoint)
//
// Every call site (read.ts, write.ts, economy.ts, api/*, mcp indirectly) goes
// through the facade in ../client.ts — none imports an adapter directly. Adapters
// normalize their wire formats to this shape so the rest of the app is unchanged.

export type LedgerMode = 'sandbox' | 'canton3-local' | 'devnet';

/** A ledger contract, normalized across API versions: what read/write/economy consume. */
export interface ContractRow {
  contractId: string;
  /** The create arguments (v1 `payload`, v2 `createArgument`) — same field access downstream. */
  payload: any;
  templateId?: string;
}

export interface LedgerHealth {
  reachable: boolean;
  error: string | null;
  /** Number of parties known to the participant (best-effort; for /api/health). */
  partyCount?: number;
}

export interface LedgerAdapter {
  readonly mode: LedgerMode;
  /** host:port only — NEVER a token/secret. For /api/health + the economy strip. */
  readonly ledgerUrl: string;
  /** The package id whose templates this adapter targets. */
  readonly packageId: string;
  /** True when the package id came from env rather than a hardcoded default. */
  readonly packageIdFromEnv: boolean;

  /** Reuse an existing party with this hint, or allocate it. Returns the full party id. */
  ensureParty(hint: string): Promise<string>;

  /** Create a contract, submitting as `actAs`. Returns the new contract id. */
  create(templateId: string, payload: Record<string, unknown>, actAs: string[]): Promise<string>;

  /** Exercise a choice, submitting as `actAs`. Returns the choice's result value. */
  exercise(
    templateId: string,
    contractId: string,
    choice: string,
    argument: Record<string, unknown>,
    actAs: string[],
  ): Promise<any>;

  /**
   * Active contracts of `templateIds` visible to `party` (the LEDGER enforces
   * visibility — this is the load-bearing privacy mechanic). `query` is an
   * optional payload-field equality predicate, applied identically to v1's
   * server-side query (v2 applies it client-side over the returned ACS).
   */
  queryAs(party: string, templateIds: string[], query?: Record<string, unknown>): Promise<ContractRow[]>;

  /** Fast liveness probe. */
  reachable(): Promise<boolean>;

  /** Liveness + a human-readable error (+ optional partyCount) for /api/health. */
  health(): Promise<LedgerHealth>;

  /** Upload a DAR (bytes) to the participant. v2 only; sandbox uses --dar at boot. */
  uploadDar?(dar: Uint8Array): Promise<void>;
}
