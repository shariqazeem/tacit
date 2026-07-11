// Tacit — ledger mode + endpoint/auth/package resolution, all from env.
//
// Nothing here is secret-bearing in the values it EXPORTS for display
// (ledgerUrl is host:port only); the OAuth client secret is read but never
// re-exported to anything browser-bound.

import type { LedgerMode } from './types';

const RAW_MODE = (process.env.TACIT_LEDGER_MODE || 'sandbox').toLowerCase();
export const LEDGER_MODE: LedgerMode =
  RAW_MODE === 'devnet'
    ? 'devnet'
    : RAW_MODE === 'canton3-local' || RAW_MODE === 'canton3' || RAW_MODE === 'local3'
      ? 'canton3-local'
      : 'sandbox';

/** canton3-local and devnet both speak the v2 JSON Ledger API. */
export const IS_V2 = LEDGER_MODE !== 'sandbox';

// ── sandbox (Daml 2.x v1 HTTP JSON API) ──────────────────────────────────────
export const V1_JSON_API = process.env.DAML_JSON_API_URL || 'http://localhost:7575';
export const V1_LEDGER_ID = process.env.DAML_LEDGER_ID || 'sandbox';
export const APP_ID = process.env.DAML_APPLICATION_ID || 'tacit';
export const V1_SECRET = process.env.DAML_TOKEN_SECRET || 'tacit-dev-secret';
const V1_DEFAULT_PKG = 'c0f7a95e01d57cc04dd72478d7886b98556d0831956767ac8e84f42b664bde1a';
export const V1_PACKAGE_ID = process.env.TACIT_PACKAGE_ID || V1_DEFAULT_PKG;
export const V1_PACKAGE_FROM_ENV = !!process.env.TACIT_PACKAGE_ID;

// ── canton v2 (Canton 3.x — canton3-local + devnet) ──────────────────────────
export const V2_API_URL = process.env.TACIT_V2_API_URL || 'http://localhost:7575';

export type V2Auth = 'none' | 'static' | 'oauth';
const RAW_V2_AUTH = (process.env.TACIT_V2_AUTH || '').toLowerCase();
export const V2_AUTH: V2Auth = (['none', 'static', 'oauth'] as const).includes(RAW_V2_AUTH as V2Auth)
  ? (RAW_V2_AUTH as V2Auth)
  : LEDGER_MODE === 'devnet'
    ? 'oauth' // devnet defaults to real OAuth; local defaults to no auth
    : 'none';

export const V2_STATIC_TOKEN = process.env.TACIT_V2_STATIC_TOKEN || '';
// Frozen v2 (Daml 3.4.11) templates package. Ported VERBATIM from the v1 source
// (semantic parity; daml test green: test 2/10, testAuditor 4/11 — identical to
// v1). Overridable via env after a rebuild.
const V2_DEFAULT_PKG = 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
export const V2_PACKAGE_ID = process.env.TACIT_PACKAGE_ID_V2 || V2_DEFAULT_PKG;
export const V2_PACKAGE_FROM_ENV = !!process.env.TACIT_PACKAGE_ID_V2;
// Canton 3.x template filters + commands reference the package by NAME
// (version-agnostic: `#tacit:Module:Entity`), not the hex id. The hex id stays
// for /api/health + DAR-upload idempotency.
export const V2_PACKAGE_NAME = process.env.TACIT_PACKAGE_NAME_V2 || 'tacit';
// v2 is user-based auth: the app acts as this ledger-api USER (the token's
// subject must equal it, and it must hold CanActAs on the demo parties —
// devnet-bootstrap grants that). LocalNet's user is `ledger-api-user`.
export const V2_USER_ID = process.env.TACIT_V2_USER_ID || APP_ID;

// Pinned party ids (JSON map: logical hint → full `Name::fingerprint`). Used on
// SHARED validators (devnet) that won't list parties to re-derive them — we
// pre-allocate the demo parties once (devnet-bootstrap) and pin them here.
export const PINNED_PARTIES: Record<string, string> = (() => {
  try {
    return process.env.TACIT_PARTIES_JSON ? JSON.parse(process.env.TACIT_PARTIES_JSON) : {};
  } catch {
    return {};
  }
})();

/** OAuth2 client-credentials config (devnet). Secret is used to mint tokens, never displayed. */
export const OAUTH = {
  tokenUrl: process.env.TACIT_DEVNET_TOKEN_URL || '',
  clientId: process.env.TACIT_DEVNET_CLIENT_ID || '',
  clientSecret: process.env.TACIT_DEVNET_CLIENT_SECRET || '',
  audience: process.env.TACIT_DEVNET_AUDIENCE || '',
  scope: process.env.TACIT_DEVNET_SCOPE || '',
};

// ── active selection (what the facade + templates use) ───────────────────────
export const ACTIVE_PACKAGE_ID = IS_V2 ? V2_PACKAGE_ID : V1_PACKAGE_ID;
export const ACTIVE_PACKAGE_FROM_ENV = IS_V2 ? V2_PACKAGE_FROM_ENV : V1_PACKAGE_FROM_ENV;
/** host:port only — safe for /api/health + client display. */
export const ACTIVE_LEDGER_URL = IS_V2 ? V2_API_URL : V1_JSON_API;
