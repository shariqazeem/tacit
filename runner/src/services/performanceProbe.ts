// web_performance_probe — a REAL, bounded performance pre-screen of a public HTTPS
// endpoint. NOT a load test: 5 fresh-connection samples, no concurrency, no sustained
// traffic. Observations are injected (PerfObservers) so unit tests supply fixtures
// with zero network and without weakening SSRF. Timings vary run to run (honest); the
// SCORE is a PURE function of the report — every deduction is in scoringBreakdown.
import type { WebPerformanceProbeReport, PerfSample, PerfAgg, Finding, ScoringContribution, Severity } from '../_shared.js';

export const METHODOLOGY_VERSION = 'wpp-1.0';
export const SCORING_VERSION = 'wpp-score-1';
export const SAMPLE_COUNT = 5;

// ── observation shapes ────────────────────────────────────────────────────────
export interface TargetObservation {
  finalUrl: string;
  host: string;
  redirectCount: number;
  status: number;
  httpVersion: string; // 'HTTP/2' | 'HTTP/1.1' (from ALPN)
  headers: Record<string, string>; // lowercased final-response headers (bounded)
}
export interface PerfObservers {
  resolveTarget(inputUrl: string): Promise<TargetObservation>;
  sample(finalUrl: string): Promise<PerfSample>;
  now(): number;
}

// ── thresholds (documented constants; the registry cites these) ──────────────
export const THRESHOLDS = {
  ttfbSlowMediumMs: 800,
  ttfbSlowHighMs: 1500,
  tlsSlowMs: 300,
  redirectMediumCount: 3,
  redirectLowCount: 2,
  heavyPayloadBytes: 1024 * 1024,
  sampleCapBytes: 256 * 1024,
};

const COMPRESSIBLE = [/^text\//, /application\/(json|javascript|xml|.*\+xml|xhtml)/, /image\/svg\+xml/];
function isCompressible(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return COMPRESSIBLE.some((re) => re.test(ct));
}

function agg(vals: number[]): PerfAgg {
  const s = [...vals].sort((a, b) => a - b);
  return { minMs: Math.round(s[0] ?? 0), medianMs: Math.round(s[Math.floor(s.length / 2)] ?? 0), maxMs: Math.round(s[s.length - 1] ?? 0) };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

interface Rule {
  when: boolean;
  key: string;
  label: string;
  points: number;
  observed: string;
  finding?: { severity: Severity; category: string; title: string; evidence: string; remediation: string };
}

export function probeFromObservations(input: { url: string }, target: TargetObservation, samples: PerfSample[], startedMs: number, endedMs: number): WebPerformanceProbeReport {
  const ttfb = agg(samples.map((s) => s.ttfbMs));
  const tls = agg(samples.map((s) => s.tlsMs));
  const total = agg(samples.map((s) => s.totalMs));
  const bytesSampled = agg(samples.map((s) => s.bytesRead)).medianMs; // median bytes

  const ct = target.headers['content-type'] || null;
  const ce = target.headers['content-encoding'] || null;
  const compressibleWithoutCompression = isCompressible(ct) && !ce;
  const cacheControl = target.headers['cache-control'] || null;
  const etag = target.headers['etag'] || null;
  const lastModified = target.headers['last-modified'] || null;
  const age = target.headers['age'] || null;
  const contentLength = Number(target.headers['content-length'] || 0);
  const heavy = bytesSampled >= THRESHOLDS.sampleCapBytes || contentLength > THRESHOLDS.heavyPayloadBytes;
  const http2 = /HTTP\/2/i.test(target.httpVersion);

  const rules: Rule[] = [
    { when: ttfb.medianMs > THRESHOLDS.ttfbSlowHighMs, key: 'ttfb_slow_high', label: 'TTFB very slow', points: -30, observed: `median=${ttfb.medianMs}ms`,
      finding: { severity: 'high', category: 'latency', title: 'Time-to-first-byte is very slow', evidence: `median TTFB ${ttfb.medianMs}ms (> ${THRESHOLDS.ttfbSlowHighMs}ms)`, remediation: 'Reduce server processing time and enable edge caching / a CDN for the origin.' } },
    { when: ttfb.medianMs > THRESHOLDS.ttfbSlowMediumMs && ttfb.medianMs <= THRESHOLDS.ttfbSlowHighMs, key: 'ttfb_slow_medium', label: 'TTFB slow', points: -15, observed: `median=${ttfb.medianMs}ms`,
      finding: { severity: 'medium', category: 'latency', title: 'Time-to-first-byte is slow', evidence: `median TTFB ${ttfb.medianMs}ms (> ${THRESHOLDS.ttfbSlowMediumMs}ms)`, remediation: 'Cache responses or move compute closer to users to lower TTFB.' } },
    { when: compressibleWithoutCompression, key: 'no_compression', label: 'Compressible content served uncompressed', points: -10, observed: `type=${ct}, encoding=${ce || 'none'}`,
      finding: { severity: 'medium', category: 'transfer', title: 'Compressible content served without compression', evidence: `content-type ${ct} with no content-encoding`, remediation: 'Enable gzip, brotli or zstd for text responses.' } },
    { when: !cacheControl && !etag && !lastModified, key: 'no_cache_policy', label: 'No cache policy', points: -5, observed: 'no cache-control/etag/last-modified',
      finding: { severity: 'low', category: 'caching', title: 'No caching policy', evidence: 'no cache-control, etag or last-modified header', remediation: 'Set Cache-Control and/or an ETag to enable revalidation.' } },
    { when: !http2, key: 'http1_only', label: 'HTTP/2 not offered', points: -5, observed: target.httpVersion,
      finding: { severity: 'low', category: 'protocol', title: 'HTTP/2 not offered', evidence: `ALPN negotiated ${target.httpVersion}`, remediation: 'Enable HTTP/2 (or HTTP/3) at the edge to reduce round-trips.' } },
    { when: target.redirectCount >= THRESHOLDS.redirectMediumCount, key: 'long_redirect_chain', label: 'Long redirect chain', points: -8, observed: `${target.redirectCount} redirects`,
      finding: { severity: 'medium', category: 'latency', title: 'Long redirect chain', evidence: `${target.redirectCount} redirects before the final response`, remediation: 'Collapse redirects so the endpoint responds directly.' } },
    { when: target.redirectCount === THRESHOLDS.redirectLowCount, key: 'redirect_chain', label: 'Redirect chain', points: -4, observed: `${target.redirectCount} redirects`,
      finding: { severity: 'low', category: 'latency', title: 'Redirect chain adds latency', evidence: `${target.redirectCount} redirects`, remediation: 'Reduce redirects to a single hop where possible.' } },
    { when: tls.medianMs > THRESHOLDS.tlsSlowMs, key: 'tls_slow', label: 'Slow TLS handshake', points: -5, observed: `median=${tls.medianMs}ms`,
      finding: { severity: 'low', category: 'transport', title: 'TLS handshake is slow', evidence: `median TLS ${tls.medianMs}ms (> ${THRESHOLDS.tlsSlowMs}ms)`, remediation: 'Enable TLS session resumption / OCSP stapling and use modern cipher suites.' } },
    { when: heavy, key: 'heavy_payload', label: 'Heavy payload', points: 0, observed: `bytes≈${bytesSampled}${contentLength ? `, content-length=${contentLength}` : ''}`,
      finding: { severity: 'info', category: 'transfer', title: 'Large response payload', evidence: `sampled ~${bytesSampled} bytes${contentLength ? `, content-length ${contentLength}` : ''}`, remediation: 'Consider splitting or lazy-loading large responses.' } },
  ];

  const scoringBreakdown: ScoringContribution[] = [{ key: 'base', label: 'Baseline', points: 100, observed: 'start' }];
  const findings: Finding[] = [];
  for (const r of rules) {
    if (!r.when) continue;
    scoringBreakdown.push({ key: r.key, label: r.label, points: r.points, observed: r.observed });
    if (r.finding) findings.push({ id: r.key, ...r.finding });
  }
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.id.localeCompare(b.id));

  const value = clamp(scoringBreakdown.reduce((s, c) => s + c.points, 0));
  const band: WebPerformanceProbeReport['score']['band'] = value >= 85 ? 'fast' : value >= 65 ? 'moderate' : value >= 40 ? 'slow' : 'poor';

  const safeHeader = (v: string | null) => (v ? String(v).slice(0, 200) : null);
  return {
    service: 'web_performance_probe',
    version: 1,
    methodologyVersion: METHODOLOGY_VERSION,
    serviceVersion: 1,
    target: { inputUrl: input.url, finalUrl: target.finalUrl, host: target.host, ipPinned: true },
    protocol: { httpVersion: target.httpVersion },
    samples: samples.slice(0, SAMPLE_COUNT),
    aggregates: { ttfb, tls, total },
    transfer: { contentType: ct, contentEncoding: ce, compressibleWithoutCompression, bytesSampled },
    caching: { cacheControl: safeHeader(cacheControl), etag: safeHeader(etag), lastModified: safeHeader(lastModified), age: safeHeader(age) },
    redirects: { count: target.redirectCount, revalidatedChain: true },
    findings,
    score: { value, band, version: SCORING_VERSION, scoringBreakdown },
    limitations: [
      'Bounded performance pre-screen from a single vantage point — not a load test, uptime monitor, or availability guarantee.',
      'Five fresh-connection samples; real-world timings vary by network path and time of day.',
      'Measures TTFB/TLS/total, transfer + caching posture, and ALPN-negotiated HTTP version only.',
    ],
    measuredAtUtc: new Date(endedMs).toISOString(),
  };
}

/** Full probe: resolve the target (Phase 1), take 5 fresh-connection samples (Phase 2), compose. */
export async function probePerformance(input: { url: string }, obs: PerfObservers): Promise<WebPerformanceProbeReport> {
  const started = obs.now();
  const target = await obs.resolveTarget(input.url);
  const samples: PerfSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    if (obs.now() - started > 60_000) throw new Error('performance adapter exceeded its 60s time budget');
    samples.push(await obs.sample(target.finalUrl));
  }
  const ended = obs.now();
  return probeFromObservations(input, target, samples, started, ended);
}
