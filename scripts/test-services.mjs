// Registered-service registry unit tests (node:assert). Imports the COMPILED
// shared contract (runner/dist/_shared.js) so it tests the exact code the runner
// and app share. Run: node scripts/test-services.mjs (after `cd runner && npm run build`).
import assert from 'node:assert';
import {
  getService, isRegisteredService, listPublicServices, SERVICE_IDS, DEFAULT_SERVICE,
  VENDOR_SERVICE, LEGACY_SITE_AUDIT, canonicalize, utf8Bytes,
} from '../runner/dist/_shared.js';

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

console.log(fail ? `\n❌ ${fail} test(s) failed` : `\n✅ all ${pass} service registry tests passed`);
process.exit(fail ? 1 : 0);
