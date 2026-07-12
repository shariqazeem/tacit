// vendor_security_assessment tests. Fixture-based (deterministic composition, no
// internet) + one live example.com integration. Compiled to dist/vendorTest.js.
import assert from 'node:assert';
import { assessFromObservations, assessVendor, type HttpTlsObservation, type DnsObservation, type SecTxtObservation, METHODOLOGY_VERSION, SCORING_VERSION } from './services/vendorAssessment.js';
import { realObservers } from './services/vendorObservers.js';
import { isForbiddenIp, assertSafeUrl, SsrfError } from './ssrf.js';
import { getService, VENDOR_SERVICE } from './_shared.js';

let pass = 0, fail = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve().then(fn).then(() => { console.log('  ✅ ' + name); pass++; }).catch((e) => { console.error('  ❌ ' + name + ' — ' + (e as Error).message); fail++; });

const goodTls = { ok: true, protocol: 'TLSv1.3', authorized: true, certIssuer: "Let's Encrypt", certSubject: 'example.com', validFromUtc: '2026-01-01T00:00:00.000Z', validToUtc: '2027-01-01T00:00:00.000Z', hostnameMatch: true };
const allHeaders = { 'strict-transport-security': 'max-age=63072000', 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=()', 'x-frame-options': 'DENY' };
const http = (over: Partial<HttpTlsObservation> = {}): HttpTlsObservation => ({ ok: true, httpStatus: 200, finalUrl: 'https://example.com/', redirectChain: [], contentType: 'text/html', sampledByteLength: 600, pageTitle: 'Example', headers: { ...allHeaders }, setCookies: [], tls: { ...goodTls }, ...over });
const dnsAll = (over: Partial<DnsObservation> = {}): DnsObservation => ({ caa: 'present', mx: 'present', spf: 'present', dmarc: 'present', ...over });
const secPresent: SecTxtObservation = { status: 'present', httpStatus: 200 };
const T0 = Date.parse('2026-07-12T00:00:00.000Z');
const NOW = Date.parse('2026-07-12T00:00:01.000Z');
const svc = getService(VENDOR_SERVICE)!;

async function main() {
  console.log('vendor_security_assessment tests\n');

  await t('clean posture → strong band, high score, no critical findings', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http(), dnsAll(), secPresent, T0, NOW, NOW);
    assert.equal(r.service, VENDOR_SERVICE);
    assert.equal(r.methodologyVersion, METHODOLOGY_VERSION);
    assert.equal(r.scoringVersion, SCORING_VERSION);
    assert.ok(r.score >= 85, `score ${r.score}`);
    assert.equal(r.riskBand, 'strong');
    assert.ok(!r.findings.some((f) => f.severity === 'critical'));
    assert.equal(svc.validateReport(r).ok, true);
    assert.equal(svc.bindsToRequest(r, { url: 'https://example.com' }).ok, true);
  });

  await t('expired cert → critical band dominates, score capped low', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http({ tls: { ...goodTls, validToUtc: '2020-01-01T00:00:00.000Z' } }), dnsAll(), secPresent, T0, NOW, NOW);
    assert.equal(r.riskBand, 'critical');
    assert.ok(r.score <= 39, `score ${r.score}`);
    assert.ok(r.findings.some((f) => f.id === 'cert_expired' && f.severity === 'critical'));
  });

  await t('TLS not authorized → critical transport finding', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http({ tls: { ...goodTls, authorized: false, error: 'self signed certificate' } }), dnsAll(), secPresent, T0, NOW, NOW);
    assert.equal(r.riskBand, 'critical');
    assert.ok(r.findings.some((f) => f.id === 'tls_broken'));
  });

  await t('missing HSTS/CSP/frame produce medium findings + point deductions', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http({ headers: { 'x-content-type-options': 'nosniff' } }), dnsAll(), secPresent, T0, NOW, NOW);
    const ids = r.findings.map((f) => f.id);
    assert.ok(ids.includes('no_hsts') && ids.includes('no_csp') && ids.includes('no_frame'));
    assert.ok(r.scoringBreakdown.some((c) => c.key === 'no_hsts' && c.points < 0));
    assert.ok(r.score < 90);
  });

  await t('insecure cookies detected without storing values', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http({ setCookies: ['sid=SECRETVALUE; Path=/', 'a=b; Secure; HttpOnly; SameSite=Lax'] }), dnsAll(), secPresent, T0, NOW, NOW);
    assert.equal(r.cookies.count, 2);
    assert.equal(r.cookies.secure, 1);
    assert.ok(r.findings.some((f) => f.id === 'insecure_cookies'));
    assert.ok(!JSON.stringify(r).includes('SECRETVALUE'), 'cookie value must not leak into the report');
  });

  await t('absent SPF/DMARC/CAA/security.txt produce findings', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http(), dnsAll({ spf: 'absent', dmarc: 'absent', caa: 'absent' }), { status: 'absent', httpStatus: 404 }, T0, NOW, NOW);
    const ids = r.findings.map((f) => f.id);
    assert.ok(ids.includes('no_spf') && ids.includes('no_dmarc') && ids.includes('no_caa') && ids.includes('no_securitytxt'));
  });

  await t('unavailable sub-checks are distinct from insecure (no false finding)', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http(), dnsAll({ spf: 'unavailable', dmarc: 'unavailable' }), { status: 'unavailable', httpStatus: null }, T0, NOW, NOW);
    const ids = r.findings.map((f) => f.id);
    assert.ok(!ids.includes('no_spf') && !ids.includes('no_dmarc') && !ids.includes('no_securitytxt'), 'unavailable must not become an insecure finding');
  });

  await t('deterministic: same observations → identical report (minus timestamps)', () => {
    const a = assessFromObservations({ url: 'https://example.com' }, http({ headers: { 'x-content-type-options': 'nosniff' } }), dnsAll({ spf: 'absent' }), secPresent, T0, NOW, NOW);
    const b = assessFromObservations({ url: 'https://example.com' }, http({ headers: { 'x-content-type-options': 'nosniff' } }), dnsAll({ spf: 'absent' }), secPresent, T0 + 5, NOW + 5, NOW);
    const strip = (r: any) => ({ ...r, assessmentStartedAtUtc: '', assessmentEndedAtUtc: '', durationMs: 0 });
    assert.deepEqual(strip(a), strip(b));
  });

  await t('buyer can recompute the score from scoringBreakdown', () => {
    const r = assessFromObservations({ url: 'https://example.com' }, http({ headers: { 'x-content-type-options': 'nosniff' } }), dnsAll({ spf: 'absent' }), secPresent, T0, NOW, NOW);
    const sum = Math.max(0, Math.min(100, Math.round(r.scoringBreakdown.reduce((s, c) => s + c.points, 0))));
    // score equals the clamped breakdown sum unless critical-transport capping applied (not here)
    assert.equal(r.score, sum);
  });

  await t('LIVE: real passive assessment of https://example.com returns measured data', async () => {
    const r = await assessVendor({ url: 'https://example.com' }, realObservers);
    assert.equal(r.service, VENDOR_SERVICE);
    assert.equal(r.hostname, 'example.com');
    assert.ok(r.httpStatus > 0, `status ${r.httpStatus}`);
    assert.equal(r.tls.ok, true);
    assert.ok(r.tls.certIssuer, 'observed a real cert issuer');
    assert.ok(typeof r.tls.daysRemaining === 'number', 'measured cert days remaining');
    assert.ok(r.durationMs >= 0);
    assert.equal(svc.validateReport(r).ok, true, 'live report passes schema');
    assert.equal(svc.bindsToRequest(r, { url: 'https://example.com' }).ok, true);
    console.log(`     status=${r.httpStatus} tls=${r.tls.protocol} certTo=${r.tls.validToUtc} days=${r.tls.daysRemaining} score=${r.score} band=${r.riskBand} findings=${r.findings.length}`);
  });

  await t('SSRF: IPv4 + IPv6 private/loopback/link-local/metadata classes rejected', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) assert.equal(isForbiddenIp(ip), true, `v4 ${ip}`);
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd00::1', '::ffff:127.0.0.1', 'ff02::1']) assert.equal(isForbiddenIp(ip), true, `v6 ${ip}`);
    assert.equal(isForbiddenIp('93.184.216.34'), false, 'public v4 allowed');
  });

  await t('SSRF: scheme/port/credentials enforced at parse (downgrade + non-443 rejected)', () => {
    for (const bad of ['http://example.com', 'https://example.com:8443', 'https://u:p@example.com', 'https://localhost']) {
      assert.throws(() => assertSafeUrl(bad), SsrfError, bad);
    }
    assert.ok(assertSafeUrl('https://example.com'));
  });

  console.log(fail ? `\n❌ ${fail} vendor test(s) failed` : `\n✅ all ${pass} vendor tests passed`);
  process.exit(fail ? 1 : 0);
}
main();
