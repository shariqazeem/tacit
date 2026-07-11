// The site_audit service task. Performs a REAL, bounded, SSRF-protected HTTPS
// audit of a user-supplied URL and produces a canonical JSON report from actual
// observations — no fixtures, no random values, no LLM. The winning runner runs
// this; the exact canonical bytes + their SHA-256 are what it delivers on-ledger.
import { assertSafeUrl, resolveAndCheck, SsrfError } from './ssrf.js';
import { canonicalBytes, type Canonical } from './canonical.js';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const MAX_ARTIFACT_BYTES = 8192;

export interface AuditResult {
  report: Record<string, unknown>;
  canonical: Canonical;
}

async function fetchNoRedirect(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'TacitSiteAudit/1' } });
  } finally {
    clearTimeout(timer);
  }
}

async function readBounded(resp: Response, cap: number): Promise<{ text: string; byteLen: number }> {
  const reader = resp.body?.getReader();
  if (!reader) return { text: '', byteLen: 0 };
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(Buffer.from(value)); total += value.length; }
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const buf = Buffer.concat(chunks).subarray(0, cap);
  return { text: buf.toString('utf8'), byteLen: total };
}

export async function siteAudit(input: { url: string }): Promise<AuditResult> {
  if (!input || typeof input.url !== 'string') throw new SsrfError('input.url (string) is required');

  let current = assertSafeUrl(input.url);
  await resolveAndCheck(current.hostname);

  let redirects = 0;
  let resp!: Response;
  let latencyMs = 0;
  for (;;) {
    const t0 = Date.now();
    resp = await fetchNoRedirect(current.toString());
    latencyMs = Date.now() - t0;
    const loc = resp.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(resp.status) && loc) {
      if (++redirects > MAX_REDIRECTS) throw new SsrfError('too many redirects');
      const next = assertSafeUrl(new URL(loc, current).toString());
      await resolveAndCheck(next.hostname); // re-validate every hop
      current = next;
      continue;
    }
    break;
  }

  const finalUrl = current.toString();
  const { text, byteLen } = await readBounded(resp, MAX_BODY_BYTES);
  const h = (n: string) => resp.headers.get(n);
  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;

  const securityHeaders = {
    'strict-transport-security': !!h('strict-transport-security'),
    'content-security-policy': !!h('content-security-policy'),
    'x-content-type-options': !!h('x-content-type-options'),
    'referrer-policy': !!h('referrer-policy'),
    'permissions-policy': !!h('permissions-policy'),
  };
  const findings: string[] = [];
  for (const [k, v] of Object.entries(securityHeaders)) if (!v) findings.push(`missing ${k}`);
  if (resp.status >= 400) findings.push(`http status ${resp.status}`);
  const present = Object.values(securityHeaders).filter(Boolean).length;
  // Deterministic score derived purely from observed checks.
  const score = Math.round((present / 5) * 60 + (resp.status < 400 ? 30 : 0) + (finalUrl.startsWith('https:') ? 10 : 0));

  const report = {
    service: 'site_audit',
    version: 1,
    requestedUrl: input.url,
    finalUrl,
    httpStatus: resp.status,
    responseLatencyMs: latencyMs,
    contentType: h('content-type') || null,
    sampledByteLength: byteLen,
    pageTitle: title,
    https: finalUrl.startsWith('https:'),
    securityHeaders,
    findings,
    score,
    auditedAtUtc: new Date().toISOString(),
  };
  const canonical = canonicalBytes(report);
  if (canonical.byteLen > MAX_ARTIFACT_BYTES) throw new Error(`audit artifact ${canonical.byteLen}B exceeds ${MAX_ARTIFACT_BYTES}B cap`);
  return { report, canonical };
}
