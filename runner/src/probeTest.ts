// web_performance_probe tests — fixture-driven (zero network) scoring/findings/schema,
// plus ONE live example.com sample and SSRF rejection. Run: node dist/probeTest.js.
import assert from 'node:assert';
import { probeFromObservations, probePerformance, type PerfObservers, type TargetObservation } from './services/performanceProbe.js';
import { realPerfObservers } from './services/performanceObservers.js';
import { getService, evaluatePolicy, type PerfSample } from './_shared.js';

let pass = 0, fail = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve().then(fn).then(() => { console.log('  ✅ ' + name); pass++; }).catch((e) => { console.error('  ❌ ' + name + ' — ' + (e as Error).message); fail++; });

const svc = getService('web_performance_probe')!;
const mkTarget = (o: Partial<TargetObservation> = {}): TargetObservation => ({ finalUrl: 'https://example.com/', host: 'example.com', redirectCount: 0, status: 200, httpVersion: 'HTTP/2', headers: { 'content-type': 'text/html', 'content-encoding': 'br', 'cache-control': 'max-age=600', etag: '"x"' }, ...o });
const mkSamples = (ttfb: number, tls = 40, total = 200, bytes = 1500): PerfSample[] => Array.from({ length: 5 }, (_, i) => ({ connectMs: 20, tlsMs: tls, ttfbMs: ttfb + i, totalMs: total + i, status: 200, bytesRead: bytes }));
const rep = (target = mkTarget(), samples = mkSamples(120)) => probeFromObservations({ url: 'https://example.com' }, target, samples, 0, 300);

async function main() {
  console.log('Tacit web_performance_probe tests\n');

  await t('fast, compressed, cached, http/2 → band fast, schema + binding + recompute ok', () => {
    const r = rep();
    assert.equal(r.service, 'web_performance_probe');
    assert.equal(r.score.band, 'fast');
    assert.equal(r.samples.length, 5);
    assert.equal(r.target.ipPinned, true);
    assert.equal(svc.validateReport(r).ok, true);
    assert.equal(svc.bindsToRequest(r, { url: 'https://example.com' }).ok, true);
    assert.equal(svc.recomputeScoreOk(r), true);
  });

  await t('slow TTFB (median > 1500ms) → high finding, score drops', () => {
    const r = rep(mkTarget(), mkSamples(1600));
    assert.ok(r.findings.some((f) => f.id === 'ttfb_slow_high' && f.severity === 'high'));
    assert.ok(r.score.value < 85);
    assert.equal(svc.recomputeScoreOk(r), true);
  });

  await t('deterministic findings fire from observed fields', () => {
    const noComp = rep(mkTarget({ headers: { 'content-type': 'text/html' } })); // compressible, no encoding
    assert.ok(noComp.findings.some((f) => f.id === 'no_compression'));
    const noCache = rep(mkTarget({ headers: { 'content-type': 'image/png' } }));
    assert.ok(noCache.findings.some((f) => f.id === 'no_cache_policy'));
    const http1 = rep(mkTarget({ httpVersion: 'HTTP/1.1' }));
    assert.ok(http1.findings.some((f) => f.id === 'http1_only'));
    const redir = rep(mkTarget({ redirectCount: 3 }));
    assert.ok(redir.findings.some((f) => f.id === 'long_redirect_chain'));
    const slowTls = rep(mkTarget(), mkSamples(120, 400));
    assert.ok(slowTls.findings.some((f) => f.id === 'tls_slow'));
  });

  await t('score is a PURE function of the report (recompute matches; tamper fails)', () => {
    const r = rep(mkTarget({ httpVersion: 'HTTP/1.1', headers: { 'content-type': 'text/html' } }));
    assert.equal(svc.recomputeScoreOk(r), true);
    const tampered = { ...r, score: { ...r.score, value: r.score.value + 1 } };
    assert.equal(svc.recomputeScoreOk(tampered as any), false);
  });

  await t('schema rejects: wrong sample count, malformed, critical finding, out-of-range score', () => {
    const good = rep();
    assert.equal(svc.validateReport({ ...good, samples: good.samples.slice(0, 4) }).ok, false, '4 samples');
    assert.equal(svc.validateReport({ ...good, findings: [{ id: 'x', severity: 'critical', category: 'c', title: 't', evidence: 'e', remediation: 'r' }] }).ok, false, 'no critical');
    assert.equal(svc.validateReport({ ...good, score: { ...good.score, value: 200 } }).ok, false, 'score range');
    assert.equal(svc.validateReport({ ...good, service: 'vendor_security_assessment' }).ok, false, 'wrong service');
  });

  await t('binding is to the INPUT url; wrong host rejected', () => {
    const r = rep();
    assert.equal(svc.bindsToRequest(r, { url: 'https://example.com' }).ok, true);
    assert.equal(svc.bindsToRequest({ ...r, target: { ...r.target, inputUrl: 'https://evil.com' } } as any, { url: 'https://example.com' }).ok, false);
    assert.equal(svc.bindsToRequest({ ...r, target: { ...r.target, host: 'evil.com' } } as any, { url: 'https://example.com' }).ok, false);
  });

  await t('policy matrix: fast→approve, poor→reject; strict stricter; total failure never approves', () => {
    const fast = rep();
    assert.equal(evaluatePolicy('latency-slo-standard-v1', fast, 'now').decision, 'approve');
    const poor = rep(mkTarget({ httpVersion: 'HTTP/1.1', headers: { 'content-type': 'text/html' } }), mkSamples(1600));
    assert.equal(poor.score.band === 'poor' || poor.score.band === 'slow', true);
    const dStd = evaluatePolicy('latency-slo-standard-v1', poor, 'now').decision;
    assert.ok(dStd === 'reject' || dStd === 'human_review');
    // strict is at least as strict as standard on the same report
    const moderate = rep(mkTarget({ httpVersion: 'HTTP/1.1', headers: { 'content-type': 'text/html' } }));
    const std = evaluatePolicy('latency-slo-standard-v1', moderate, 'now').decision;
    const strict = evaluatePolicy('latency-slo-strict-v1', moderate, 'now').decision;
    const rank = { approve: 0, approve_with_conditions: 1, human_review: 2, reject: 3 } as Record<string, number>;
    assert.ok(rank[strict] >= rank[std]);
    const errored = rep(mkTarget(), Array.from({ length: 5 }, () => ({ connectMs: 20, tlsMs: 40, ttfbMs: 100, totalMs: 200, status: 503, bytesRead: 0 })));
    assert.equal(evaluatePolicy('latency-slo-standard-v1', errored, 'now').decision, 'reject');
  });

  await t('SSRF: real observers reject a loopback/IP-literal host', async () => {
    for (const url of ['https://127.0.0.1', 'https://[::1]', 'https://169.254.169.254']) {
      await assert.rejects(() => realPerfObservers.resolveTarget(url), url);
    }
  });

  await t('LIVE: one real probe of https://example.com produces a valid report', async () => {
    const r = await probePerformance({ url: 'https://example.com' }, realPerfObservers);
    assert.equal(svc.validateReport(r).ok, true);
    assert.equal(r.samples.length, 5);
    assert.equal(r.target.ipPinned, true);
    assert.ok(['fast', 'moderate', 'slow', 'poor'].includes(r.score.band));
    assert.equal(svc.recomputeScoreOk(r), true);
    console.log(`     band=${r.score.band} median TTFB=${r.aggregates.ttfb.medianMs}ms ${r.protocol.httpVersion} findings=${r.findings.length}`);
  });

  console.log(fail ? `\n❌ ${fail} probe test(s) failed` : `\n✅ all ${pass} web_performance_probe tests passed`);
  process.exit(fail ? 1 : 0);
}
main();
