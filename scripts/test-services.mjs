// Registered-service registry unit tests (node:assert). Imports the COMPILED
// shared contract (runner/dist/_shared.js) so it tests the exact code the runner
// and app share. Run: node scripts/test-services.mjs (after `cd runner && npm run build`).
import assert from 'node:assert';
import {
  getService, isRegisteredService, listPublicServices, SERVICE_IDS, DEFAULT_SERVICE,
  VENDOR_SERVICE, LEGACY_SITE_AUDIT, canonicalize, utf8Bytes, evaluatePolicy, POLICY_IDS,
} from '../runner/dist/_shared.js';

const vendorReport = (over = {}) => ({
  service: 'vendor_security_assessment', version: 1, methodologyVersion: 'vsa-1.0', scoringVersion: 'vsa-score-1',
  requestedUrl: 'https://x.com', finalUrl: 'https://x.com/', hostname: 'x.com', pageTitle: null,
  assessmentStartedAtUtc: 't', assessmentEndedAtUtc: 't', durationMs: 1, httpStatus: 200,
  redirectChain: [], contentType: 'text/html', sampledByteLength: 1, tls: { ok: true, authorized: true },
  securityHeaders: {}, cookies: { count: 0, secure: 0, httpOnly: 0, sameSite: 0 }, dns: {}, securityTxt: { status: 'present', httpStatus: 200 },
  findings: [], score: 90, riskBand: 'strong', scoringBreakdown: [{ key: 'base', label: 'b', points: 100, observed: 'x' }], limitations: 'passive', ...over,
});

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✅ ' + name); pass++; } catch (e) { console.error('  ❌ ' + name + ' — ' + e.message); fail++; } };

console.log('Tacit registered-service tests\n');

t('vendor is the default new service; site_audit is legacy', () => {
  assert.equal(DEFAULT_SERVICE, VENDOR_SERVICE);
  assert.deepEqual([...SERVICE_IDS].sort(), [LEGACY_SITE_AUDIT, VENDOR_SERVICE].sort());
});

t('registered services resolve; unknown does not', () => {
  assert.ok(getService(VENDOR_SERVICE));
  assert.ok(getService(LEGACY_SITE_AUDIT));
  assert.equal(getService('port_scan'), undefined);
  assert.equal(getService('../../etc/passwd'), undefined);
  assert.equal(isRegisteredService('rm -rf /'), false);
  assert.equal(isRegisteredService(VENDOR_SERVICE), true);
});

t('valid https input accepted; unsafe/invalid rejected', () => {
  const svc = getService(VENDOR_SERVICE);
  assert.equal(svc.validateInput({ url: 'https://example.com' }).ok, true);
  assert.equal(svc.validateInput({ url: 'http://example.com' }).ok, false, 'http rejected');
  assert.equal(svc.validateInput({ url: 'https://user:pass@example.com' }).ok, false, 'creds rejected');
  assert.equal(svc.validateInput({ url: 'https://example.com:8443' }).ok, false, 'non-443 rejected');
  assert.equal(svc.validateInput({ url: 'ftp://example.com' }).ok, false);
  assert.equal(svc.validateInput({ url: 'not a url' }).ok, false);
  assert.equal(svc.validateInput({ url: 'https://nodot' }).ok, false);
  assert.equal(svc.validateInput({}).ok, false);
});

t('canonical input is stable + sorted', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const svc = getService(VENDOR_SERVICE);
  const a = svc.canonicalInput({ url: 'https://example.com' });
  const b = svc.canonicalInput({ url: 'https://example.com' });
  assert.equal(a, b);
  assert.equal(a, '{"url":"https://example.com"}');
  assert.equal(utf8Bytes('abc'), 3);
});

t('legacy site_audit descriptor preserved', () => {
  const svc = getService(LEGACY_SITE_AUDIT);
  assert.equal(svc.legacy, true);
  assert.equal(svc.validateReport({ service: 'site_audit', requestedUrl: 'https://x.com', httpStatus: 200 }).ok, true);
  assert.equal(svc.validateReport({ service: 'vendor_security_assessment' }).ok, false);
});

t('vendor report validator: schema + service + version + score bounds', () => {
  const svc = getService(VENDOR_SERVICE);
  const good = {
    service: 'vendor_security_assessment', version: 1, methodologyVersion: 'vsa-1.0', scoringVersion: 's1',
    requestedUrl: 'https://example.com', finalUrl: 'https://example.com/', hostname: 'example.com',
    assessmentStartedAtUtc: 't', assessmentEndedAtUtc: 't', durationMs: 10, httpStatus: 200,
    tls: {}, securityHeaders: {}, cookies: {}, dns: {}, securityTxt: {},
    findings: [{ id: 'f1', severity: 'low', category: 'x', title: 't', evidence: 'e', remediation: 'r' }],
    score: 80, riskBand: 'adequate', scoringBreakdown: [{ key: 'k', label: 'l', points: 1, observed: 'o' }], limitations: 'passive',
  };
  assert.equal(svc.validateReport(good).ok, true);
  assert.equal(svc.validateReport({ ...good, service: 'site_audit' }).ok, false, 'wrong service');
  assert.equal(svc.validateReport({ ...good, version: 2 }).ok, false, 'wrong version');
  assert.equal(svc.validateReport({ ...good, score: 200 }).ok, false, 'impossible score');
  assert.equal(svc.validateReport({ ...good, riskBand: 'amazing' }).ok, false, 'invalid band');
  assert.equal(svc.validateReport({ ...good, findings: [{ id: 'f', severity: 'nope', title: 't' }] }).ok, false, 'bad finding');
  assert.equal(svc.validateReport({ ...good, scoringBreakdown: [] }).ok, false, 'empty breakdown');
});

t('vendor binding: report must match requested target/service', () => {
  const svc = getService(VENDOR_SERVICE);
  const base = { service: 'vendor_security_assessment', requestedUrl: 'https://example.com', finalUrl: 'https://example.com/' };
  assert.equal(svc.bindsToRequest(base, { url: 'https://example.com' }).ok, true);
  assert.equal(svc.bindsToRequest({ ...base, requestedUrl: 'https://evil.com' }, { url: 'https://example.com' }).ok, false);
  assert.equal(svc.bindsToRequest({ ...base, finalUrl: 'https://evil.com/' }, { url: 'https://example.com' }).ok, false);
});

t('public metadata carries no policy/internal fields', () => {
  const meta = listPublicServices();
  assert.equal(meta.length, 2);
  for (const m of meta) {
    for (const forbidden of ['baseCost', 'margin', 'minPrice', 'policy', 'secret', 'party', 'stateFile']) {
      assert.ok(!(forbidden in m), `metadata leaks ${forbidden}`);
    }
    assert.ok(m.id && m.name && Array.isArray(m.inputFields));
  }
});

t('policy: clean strong report → approve (standard)', () => {
  const d = evaluatePolicy('standard-saas-v1', vendorReport({ score: 90, riskBand: 'strong', findings: [] }), 'now');
  assert.equal(d.decision, 'approve');
  assert.ok(d.reasonCodes.length && d.policyVersion);
});
t('policy: critical transport can NEVER approve', () => {
  const rep = vendorReport({ score: 20, riskBand: 'critical', findings: [{ id: 'tls_broken', severity: 'critical', category: 'transport', title: 't', evidence: 'e', remediation: 'r' }] });
  assert.notEqual(evaluatePolicy('standard-saas-v1', rep, 'now').decision, 'approve');
  assert.equal(evaluatePolicy('strict-infrastructure-v1', rep, 'now').decision, 'reject');
});
t('policy: mid score → conditions/review with actions tied to findings', () => {
  const rep = vendorReport({ score: 70, riskBand: 'adequate', findings: [{ id: 'no_hsts', severity: 'medium', category: 'headers', title: 't', evidence: 'e', remediation: 'add hsts' }] });
  const d = evaluatePolicy('standard-saas-v1', rep, 'now');
  assert.equal(d.decision, 'approve_with_conditions');
  assert.ok(d.requiredActions.some((a) => a.findingId === 'no_hsts'));
});
t('policy: strict is stricter than standard on the same report', () => {
  const rep = vendorReport({ score: 80, riskBand: 'adequate', findings: [] });
  assert.equal(evaluatePolicy('standard-saas-v1', rep, 'now').decision, 'approve_with_conditions');
  assert.equal(evaluatePolicy('strict-infrastructure-v1', rep, 'now').decision, 'approve_with_conditions');
  const clean = vendorReport({ score: 88, riskBand: 'strong', findings: [] });
  assert.equal(evaluatePolicy('standard-saas-v1', clean, 'now').decision, 'approve');
  assert.equal(evaluatePolicy('strict-infrastructure-v1', clean, 'now').decision, 'approve_with_conditions', 'strict needs >=90');
});
t('policy: deterministic (same input → same decision)', () => {
  const rep = vendorReport({ score: 55 });
  assert.deepEqual(evaluatePolicy('standard-saas-v1', rep, 'now'), evaluatePolicy('standard-saas-v1', rep, 'now'));
  assert.deepEqual(POLICY_IDS, ['standard-saas-v1', 'strict-infrastructure-v1']);
});

console.log(fail ? `\n❌ ${fail} test(s) failed` : `\n✅ all ${pass} service registry + policy tests passed`);
process.exit(fail ? 1 : 0);
