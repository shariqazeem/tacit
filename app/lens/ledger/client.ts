// Tacit — the ledger client FACADE.
//
// One stable surface for the whole app (read.ts, write.ts, economy.ts, api/*);
// it delegates to a mode-selected adapter and re-exports the exact names call
// sites already import, so the refactor to multi-target is invisible upstream.
//
//   TACIT_LEDGER_MODE = sandbox        → Adapter A (Daml 2.x v1 JSON API, dev JWT)   [default]
//                     = canton3-local  → Adapter B (Canton 3.x v2 JSON Ledger API, auth off/static)
//                     = devnet         → Adapter B (same code, OAuth2 + real endpoint)
//
// Devnet is a one-env-var flip: canton3-local proves the entire v2 path locally.

import type { ContractRow, LedgerAdapter, LedgerHealth, LedgerMode } from './adapters/types';
import {
  ACTIVE_LEDGER_URL,
  ACTIVE_PACKAGE_FROM_ENV,
  ACTIVE_PACKAGE_ID,
  IS_V2,
  LEDGER_MODE,
  PINNED_PARTIES,
  V2_PACKAGE_NAME,
} from './adapters/config';
import { sandboxV1 } from './adapters/sandboxV1';
import { cantonV2 } from './adapters/cantonV2';

const adapter: LedgerAdapter = IS_V2 ? cantonV2 : sandboxV1;

/** The active ledger mode — for /api/health and honesty surfaces. */
export const LEDGER_MODE_ACTIVE: LedgerMode = LEDGER_MODE;
/** Where the ledger API lives (host:port only — no secrets). */
export const LEDGER_URL = ACTIVE_LEDGER_URL;
/** The package id whose templates we target (v1 or v2, per mode). */
export const PACKAGE_ID = ACTIVE_PACKAGE_ID;
/** True when the (active) package id came from env rather than a hardcoded default. */
export const PACKAGE_ID_FROM_ENV = ACTIVE_PACKAGE_FROM_ENV;

if (IS_V2 && !PACKAGE_ID) {
  console.warn(
    `[tacit] TACIT_LEDGER_MODE=${LEDGER_MODE} but TACIT_PACKAGE_ID_V2 is not set — ` +
      `v2 templates are unresolved. Build the Daml 3 DAR (npm run daml:build:v2) and set TACIT_PACKAGE_ID_V2.`,
  );
} else if (!IS_V2 && !PACKAGE_ID_FROM_ENV) {
  console.warn(
    `[tacit] TACIT_PACKAGE_ID not set — using hardcoded default ${PACKAGE_ID.slice(0, 8)}…. ` +
      `Set TACIT_PACKAGE_ID after rebuilding the DAR.`,
  );
}

// Template refs: v1/sandbox uses the hex package id; Canton 3.x (v2) references
// the package by NAME (`#tacit`), which is what its command + query filters want.
const TEMPLATE_REF = IS_V2 ? `#${V2_PACKAGE_NAME}` : PACKAGE_ID;
/** Fully-qualified template ids for the active mode. */
export const T = {
  Rfs: `${TEMPLATE_REF}:Tacit.Sealed:Rfs`,
  SealedBid: `${TEMPLATE_REF}:Tacit.Sealed:SealedBid`,
  Settlement: `${TEMPLATE_REF}:Tacit.Sealed:Settlement`,
  Iou: `${TEMPLATE_REF}:Tacit.Sealed:Iou`,
};

/** Sanitize a display name into a valid Canton party-id hint (no spaces/punct). */
export const partyHint = (name: string): string => name.trim().replace(/[^A-Za-z0-9_-]/g, '_') || 'Party';

// ── delegated surface (unchanged signatures) ─────────────────────────────────

/** Reuse an existing party with this hint, or allocate it. Returns the full party id.
 *  Pinned parties (devnet shared validator) short-circuit — no listing/allocation. */
export const ensureParty = (hint: string): Promise<string> =>
  PINNED_PARTIES[hint] ? Promise.resolve(PINNED_PARTIES[hint]) : adapter.ensureParty(hint);

/** Create a contract, submitting as `actAs`. Returns the new contract id. */
export const create = (templateId: string, payload: Record<string, unknown>, actAs: string[]): Promise<string> =>
  adapter.create(templateId, payload, actAs);

/** Query active contracts visible to `party` (the ledger enforces visibility). */
export const queryAs = (party: string, templateIds: string[], query?: Record<string, unknown>): Promise<ContractRow[]> =>
  adapter.queryAs(party, templateIds, query);

/** Exercise a choice, submitting as `actAs`. Returns the choice's result. */
export const exercise = (
  templateId: string,
  contractId: string,
  choice: string,
  argument: Record<string, unknown>,
  actAs: string[],
): Promise<any> => adapter.exercise(templateId, contractId, choice, argument, actAs);

/** Fast liveness probe. */
export const ledgerReachable = (): Promise<boolean> => adapter.reachable();

/** Liveness + human-readable error (+ optional partyCount) for /api/health. */
export const ledgerHealth = (): Promise<LedgerHealth> => adapter.health();

/** Upload a DAR to the participant (v2 only; sandbox loads its DAR at boot). */
export const uploadDar = (dar: Uint8Array): Promise<void> => {
  if (!adapter.uploadDar) throw new Error(`DAR upload is not supported in ${LEDGER_MODE} mode`);
  return adapter.uploadDar(dar);
};
