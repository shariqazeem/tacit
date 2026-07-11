// Self-test for the pure/critical runner pieces: canonicalization, SHA-256,
// SSRF guards, and a REAL site_audit against a live network target.
import assert from 'node:assert';
import { canonicalBytes, canonicalize, sha256Hex } from './canonical.js';
import { assertSafeUrl, isForbiddenIp, resolveAndCheck, SsrfError } from './ssrf.js';
import { siteAudit } from './audit.js';

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; console.log('  ✅', name); } catch (e) { fail++; console.error('  ❌', name, '—', (e as Error).message); }
};

(async () => {
  console.log('canonical:');
  await t('recursively sorted keys, deterministic', () => {
    assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.equal(canonicalize({ a: { d: 1, c: 2 }, arr: [{ y: 1, x: 2 }] }), '{"a":{"c":2,"d":1},"arr":[{"x":2,"y":1}]}');
  });
  await t('sha256 + byteLen match', () => {
    const c = canonicalBytes({ x: 1 });
    assert.equal(c.sha256, sha256Hex(Buffer.from('{"x":1}', 'utf8')));
    assert.equal(c.byteLen, 7);
  });

  console.log('ssrf:');
  await t('scheme/port/host validation', () => {
    assertSafeUrl('https://example.com');
    assert.throws(() => assertSafeUrl('http://example.com'), SsrfError);
    assert.throws(() => assertSafeUrl('https://example.com:8443'), SsrfError);
    assert.throws(() => assertSafeUrl('https://user:pw@example.com'), SsrfError);
    assert.throws(() => assertSafeUrl('https://localhost'), SsrfError);
    assert.throws(() => assertSafeUrl('ftp://example.com'), SsrfError);
  });
  await t('forbidden IPs (v4+v6) rejected, public allowed', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '172.16.0.1', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1'])
      assert.ok(isForbiddenIp(ip), `${ip} should be forbidden`);
    assert.ok(!isForbiddenIp('93.184.216.34'), 'a public v4 must be allowed');
    assert.ok(!isForbiddenIp('2606:2800:220:1:248:1893:25c8:1946'), 'a public v6 must be allowed');
  });
  await t('resolveAndCheck rejects a metadata IP host', async () => {
    await assert.rejects(resolveAndCheck('169.254.169.254'), SsrfError);
  });

  console.log('site_audit (REAL network):');
  await t('audits https://example.com from real observations', async () => {
    const { report, canonical } = await siteAudit({ url: 'https://example.com' });
    assert.equal(report.service, 'site_audit');
    assert.equal(report.requestedUrl, 'https://example.com');
    assert.ok(typeof report.httpStatus === 'number' && (report.httpStatus as number) > 0, 'real http status');
    assert.ok(typeof report.responseLatencyMs === 'number', 'measured latency');
    assert.equal(canonical.sha256.length, 64, 'sha256 hex');
    assert.ok(canonical.byteLen <= 8192, 'artifact under 8 KiB');
    // Buyer-side re-hash of the exact bytes must match the provider commitment.
    assert.equal(sha256Hex(Buffer.from(canonical.json, 'utf8')), canonical.sha256, 'buyer re-hash == commitment');
    console.log(`     status=${report.httpStatus} latency=${report.responseLatencyMs}ms bytes=${canonical.byteLen} sha=${canonical.sha256.slice(0, 16)}… score=${report.score}`);
  });
  await t('rejects an SSRF (non-https) url', async () => {
    await assert.rejects(siteAudit({ url: 'http://example.com' }), SsrfError);
  });

  console.log(`\n${fail ? '❌' : '✅'} runner self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
