// Tacit — pure ledger-error classification unit tests (node:assert). Imports the
// COMPILED shared module (runner/dist/_ledgerErrors.js). Run: node scripts/test-ledger-errors.mjs
// (after `cd runner && npm run build`).
import assert from 'node:assert';
import { classifyLedgerError, isWriteThrottle, LEDGER_WRITE_THROTTLED } from '../runner/dist/_ledgerErrors.js';

let pass = 0;
const ok = (m) => { console.log('  ✅ ' + m); pass++; };

// ── the REAL devnet write-throttle signature (captured verbatim from the probe) ──
const REAL_THROTTLE =
  'submit failed: HTTP 403 {"code":"NA","cause":"A security-sensitive error has been received","correlationId":"38bfe92459","traceId":"38bfe92459","context":{},"resources":[],"errorCategory":-1,"grpcCodeValue":7,"retryInfo":null,"definiteAnswer":null}';
assert.equal(classifyLedgerError(REAL_THROTTLE), 'throttled', 'real devnet 403 payload → throttled');
assert.equal(isWriteThrottle(REAL_THROTTLE), true);
ok('real devnet 403 "security-sensitive" (grpcCodeValue 7) → throttled');

// ── other throttle phrasings ────────────────────────────────────────────────
for (const m of [
  'submit failed: HTTP 403 permission_denied',
  'PERMISSION_DENIED: the participant refused',
  'HTTP 429 Too Many Requests',
  'RESOURCE_EXHAUSTED: quota',
  'validator is rate-limiting this client',
]) {
  assert.equal(classifyLedgerError(m), 'throttled', `throttle phrasing → throttled: ${m.slice(0, 40)}`);
}
ok('permission_denied / 429 / resource_exhausted / rate-limit variants → throttled');

// ── unreachable is DISTINCT from throttled ──────────────────────────────────
for (const m of [
  'ledger unreachable — tacit-work has no fallback',
  'fetch failed: ECONNREFUSED 127.0.0.1:3975',
  'submit failed: ETIMEDOUT',
  'The operation was aborted',
]) {
  assert.equal(classifyLedgerError(m), 'unreachable', `unreachable → unreachable: ${m.slice(0, 40)}`);
  assert.equal(isWriteThrottle(m), false, 'unreachable is NOT a write-throttle');
}
ok('unreachable / ECONNREFUSED / ETIMEDOUT / aborted → unreachable (NOT throttled)');

// ── genuine command failures are 'other' (must NOT be mistaken for a throttle) ──
for (const m of [
  'did not receive three valid runner-created bids within the timeout',
  'frozen Rfs missing before award',
  'assertion failed: amount must be <= remaining',
  'no eligible spending mandate at authorization time',
]) {
  assert.equal(classifyLedgerError(m), 'other', `real failure → other: ${m.slice(0, 40)}`);
  assert.equal(isWriteThrottle(m), false);
}
ok('genuine command failures (bid timeout, assertion, missing contract) → other, NEVER throttled');

// ── the constant is exported for the route/UI/MCP contract ──────────────────
assert.equal(LEDGER_WRITE_THROTTLED, 'LEDGER_WRITE_THROTTLED');
ok('LEDGER_WRITE_THROTTLED reason constant is stable');

// ── empty / null safety ─────────────────────────────────────────────────────
assert.equal(classifyLedgerError(''), 'other');
assert.equal(classifyLedgerError(undefined), 'other');
ok('empty / undefined message → other (no throw)');

console.log(`\n✅ all ${pass} ledger-error classification tests passed`);
