// Tacit — PURE classification of Canton ledger submit errors (browser + node safe).
// The shared devnet validator RATE-LIMITS WRITES from a credential after heavy bursts:
// a submit returns HTTP 403 with "A security-sensitive error has been received"
// (gRPC PERMISSION_DENIED, code 7). Reads are unaffected. We classify that write-throttle
// class DISTINCTLY from a genuinely unreachable ledger, so the product can show a calm,
// honest "devnet is rate-limiting writes" state (nothing started, nothing spent) instead of
// a generic failure. Reactive on a real failure only — never a proactive write-canary.

/** Machine-readable reason attached to a throttled procurement response. */
export const LEDGER_WRITE_THROTTLED = 'LEDGER_WRITE_THROTTLED';

export type LedgerErrorClass = 'throttled' | 'unreachable' | 'other';

/**
 * Classify a ledger submit error message.
 *  - 'throttled'   → the validator is rate-limiting/again refusing WRITES from this
 *                    credential (403 + security-sensitive, PERMISSION_DENIED / gRPC code 7,
 *                    RESOURCE_EXHAUSTED, or an explicit 429 / rate-limit). Retryable.
 *  - 'unreachable' → the ledger endpoint itself is down / timed out.
 *  - 'other'       → anything else (a real command failure, a bug, etc).
 */
export function classifyLedgerError(message: string): LedgerErrorClass {
  const m = (message || '').toLowerCase();
  const throttled =
    (/\b403\b/.test(m) && /security[-\s]?sensitive|permission[_\s]?denied/.test(m)) ||
    /permission_denied/.test(m) ||
    /"?grpccodevalue"?\s*[:=]\s*7\b/.test(m) ||
    /\bgrpc code 7\b/.test(m) ||
    /resource_exhausted/.test(m) ||
    /\b429\b/.test(m) ||
    /too many requests/.test(m) ||
    /rate[-\s]?limit/.test(m);
  if (throttled) return 'throttled';
  // Ledger connectivity failures ONLY — deliberately NOT bare "timeout"/"aborted", which
  // also appear in work-flow failures (e.g. "no bids within the timeout") that are 'other'.
  const unreachable =
    /unreachable|econnrefused|etimedout|fetch failed|enotfound|socket hang up|operation was aborted|network error/.test(m);
  if (unreachable) return 'unreachable';
  return 'other';
}

/** True iff the error is the devnet write-throttle / backpressure class (retryable). */
export function isWriteThrottle(message: string): boolean {
  return classifyLedgerError(message) === 'throttled';
}
