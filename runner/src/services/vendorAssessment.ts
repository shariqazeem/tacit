// vendor_security_assessment — a REAL, passive, bounded public web-security posture
// pre-screen. NOT a pentest: no exploitation, port scanning, fuzzing, auth, JS exec,
// form submission or path enumeration beyond /.well-known/security.txt.
//
// Observations are injected (VendorObservers) so unit tests supply fixtures without
// the public internet and without weakening SSRF policy. The composition below —
// findings + versioned scoring — is PURE and deterministic (same normalized
// observations → same report, except timestamps + measured duration). No LLM, no
// random values, no fixtures in the production path.
import type { VendorSecurityAssessmentReport, Finding, ScoringContribution, Severity } from '../_shared.js';

export const METHODOLOGY_VERSION = 'vsa-1.0';
export const SCORING_VERSION = 'vsa-score-1';

// ── observation shapes (what the observers return) ───────────────────────────
export interface HttpTlsObservation {
  ok: boolean;
  httpStatus: number;
  finalUrl: string;
  redirectChain: string[];
  contentType: string | null;
  sampledByteLength: number;
  pageTitle: string | null;
  headers: Record<string, string>; // lowercased name → value (bounded)
  setCookies: string[]; // raw Set-Cookie strings; VALUES are never stored in the report
  tls: {
    ok: boolean;
    protocol: string | null;
    authorized: boolean;
    certIssuer: string | null;
    certSubject: string | null;
    validFromUtc: string | null;
    validToUtc: string | null;
    hostnameMatch: boolean | null;
    error?: string;
  };
  error?: string;
}
export interface DnsObservation {
  caa: 'present' | 'absent' | 'unavailable';
  mx: 'present' | 'absent' | 'unavailable';
  spf: 'present' | 'absent' | 'unavailable';
  dmarc: 'present' | 'absent' | 'unavailable';
}
export interface SecTxtObservation {
  status: 'present' | 'absent' | 'unavailable';
  httpStatus: number | null;
}
export interface VendorObservers {
  probe(url: string): Promise<HttpTlsObservation>;
  dns(hostname: string): Promise<DnsObservation>;
  securityTxt(hostname: string): Promise<SecTxtObservation>;
  now(): number; // epoch ms
}

// ── header helpers ────────────────────────────────────────────────────────────
const SECURITY_HEADER_KEYS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
] as const;

function frameProtected(headers: Record<string, string>): boolean {
  const xfo = (headers['x-frame-options'] || '').toLowerCase();
  const csp = (headers['content-security-policy'] || '').toLowerCase();
  return xfo.includes('deny') || xfo.includes('sameorigin') || csp.includes('frame-ancestors');
}

function cookiePosture(setCookies: string[]) {
  let secure = 0, httpOnly = 0, sameSite = 0;
  for (const c of setCookies) {
    const lc = c.toLowerCase();
    if (/;\s*secure(;|$|\s)/.test(lc) || /;\s*secure$/.test(lc)) secure++;
    if (/;\s*httponly/.test(lc)) httpOnly++;
    if (/;\s*samesite=/.test(lc)) sameSite++;
  }
  return { count: setCookies.length, secure, httpOnly, sameSite };
}

// ── deterministic findings + scoring ─────────────────────────────────────────
interface Rule {
  when: boolean;
  key: string;
  label: string;
  points: number; // negative penalty
  observed: string;
  finding?: { severity: Severity; category: string; title: string; evidence: string; remediation: string };
}

function buildRules(o: HttpTlsObservation, dns: DnsObservation, sec: SecTxtObservation, daysRemaining: number | null, headerPresent: Record<string, boolean>, cookies: ReturnType<typeof cookiePosture>): Rule[] {
  const tlsBroken = !o.tls.ok || !o.tls.authorized;
  const certExpired = daysRemaining != null && daysRemaining < 0;
  const insecureCookies = cookies.count > 0 && cookies.secure < cookies.count;
  return [
    { when: tlsBroken, key: 'tls_broken', label: 'TLS not established / not authorized', points: -50, observed: o.tls.error || `authorized=${o.tls.authorized}`,
      finding: { severity: 'critical', category: 'transport', title: 'TLS could not be securely established', evidence: o.tls.error || `authorized=${o.tls.authorized}, protocol=${o.tls.protocol}`, remediation: 'Serve a valid, trusted certificate over TLS 1.2+ with a matching hostname.' } },
    { when: certExpired, key: 'cert_expired', label: 'Certificate expired', points: -50, observed: `validTo=${o.tls.validToUtc}`,
      finding: { severity: 'critical', category: 'transport', title: 'TLS certificate is expired', evidence: `validTo=${o.tls.validToUtc}`, remediation: 'Renew the certificate and enable automated renewal.' } },
    { when: daysRemaining != null && daysRemaining >= 0 && daysRemaining < 14, key: 'cert_expiring', label: 'Certificate expiring soon', points: -10, observed: `${daysRemaining} days`,
      finding: { severity: 'medium', category: 'transport', title: 'TLS certificate expires within 14 days', evidence: `${daysRemaining} days remaining`, remediation: 'Renew the certificate and enable automated renewal.' } },
    { when: o.tls.hostnameMatch === false, key: 'hostname_mismatch', label: 'Certificate hostname mismatch', points: -20, observed: `subject=${o.tls.certSubject}`,
      finding: { severity: 'high', category: 'transport', title: 'Certificate does not match the hostname', evidence: `subject=${o.tls.certSubject}`, remediation: 'Issue a certificate covering the requested hostname.' } },
    { when: !headerPresent['strict-transport-security'], key: 'no_hsts', label: 'Missing HSTS', points: -8, observed: 'absent',
      finding: { severity: 'medium', category: 'headers', title: 'HSTS not set', evidence: 'strict-transport-security header absent', remediation: 'Add Strict-Transport-Security with a long max-age.' } },
    { when: !headerPresent['content-security-policy'], key: 'no_csp', label: 'Missing CSP', points: -8, observed: 'absent',
      finding: { severity: 'medium', category: 'headers', title: 'Content-Security-Policy not set', evidence: 'content-security-policy header absent', remediation: 'Add a restrictive Content-Security-Policy.' } },
    { when: !frameProtected(o.headers), key: 'no_frame', label: 'Missing clickjacking protection', points: -8, observed: 'absent',
      finding: { severity: 'medium', category: 'headers', title: 'No clickjacking protection', evidence: 'no X-Frame-Options or CSP frame-ancestors', remediation: 'Set X-Frame-Options: DENY or CSP frame-ancestors.' } },
    { when: !headerPresent['x-content-type-options'], key: 'no_xcto', label: 'Missing X-Content-Type-Options', points: -5, observed: 'absent',
      finding: { severity: 'low', category: 'headers', title: 'MIME-sniffing not disabled', evidence: 'x-content-type-options header absent', remediation: 'Set X-Content-Type-Options: nosniff.' } },
    { when: !headerPresent['referrer-policy'], key: 'no_referrer', label: 'Missing Referrer-Policy', points: -4, observed: 'absent',
      finding: { severity: 'low', category: 'headers', title: 'Referrer-Policy not set', evidence: 'referrer-policy header absent', remediation: 'Set a restrictive Referrer-Policy.' } },
    { when: !headerPresent['permissions-policy'], key: 'no_permissions', label: 'Missing Permissions-Policy', points: -3, observed: 'absent',
      finding: { severity: 'info', category: 'headers', title: 'Permissions-Policy not set', evidence: 'permissions-policy header absent', remediation: 'Disable unused browser features via Permissions-Policy.' } },
    { when: insecureCookies, key: 'insecure_cookies', label: 'Cookies without Secure flag', points: -5, observed: `${cookies.secure}/${cookies.count} secure`,
      finding: { severity: 'medium', category: 'cookies', title: 'Cookies set without the Secure flag', evidence: `${cookies.secure}/${cookies.count} cookies had Secure`, remediation: 'Set Secure, HttpOnly and SameSite on session cookies.' } },
    { when: dns.dmarc === 'absent', key: 'no_dmarc', label: 'No DMARC record', points: -5, observed: 'absent',
      finding: { severity: 'medium', category: 'email', title: 'No DMARC policy', evidence: '_dmarc TXT absent', remediation: 'Publish a DMARC record to reduce spoofing.' } },
    { when: dns.spf === 'absent', key: 'no_spf', label: 'No SPF record', points: -4, observed: 'absent',
      finding: { severity: 'low', category: 'email', title: 'No SPF record', evidence: 'SPF TXT absent', remediation: 'Publish an SPF record.' } },
    { when: dns.caa === 'absent', key: 'no_caa', label: 'No CAA record', points: -3, observed: 'absent',
      finding: { severity: 'low', category: 'dns', title: 'No CAA record', evidence: 'CAA absent', remediation: 'Publish CAA to restrict which CAs may issue.' } },
    { when: sec.status === 'absent', key: 'no_securitytxt', label: 'No security.txt', points: -2, observed: 'absent',
      finding: { severity: 'info', category: 'disclosure', title: 'No security.txt', evidence: '/.well-known/security.txt absent', remediation: 'Publish a security.txt with a contact.' } },
    { when: o.httpStatus >= 400, key: 'http_error', label: 'HTTP error status', points: -10, observed: `status=${o.httpStatus}`,
      finding: { severity: 'high', category: 'availability', title: `HTTP ${o.httpStatus} on the root URL`, evidence: `status=${o.httpStatus}`, remediation: 'Ensure the endpoint is reachable over HTTPS.' } },
  ];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function assessFromObservations(input: { url: string }, o: HttpTlsObservation, dns: DnsObservation, sec: SecTxtObservation, startedAtMs: number, endedAtMs: number, nowMs: number): VendorSecurityAssessmentReport {
  const hostname = safeHost(o.finalUrl) || safeHost(input.url);
  const daysRemaining = o.tls.validToUtc ? Math.floor((Date.parse(o.tls.validToUtc) - nowMs) / 86_400_000) : null;

  const headerPresent: Record<string, boolean> = {};
  const securityHeaders: Record<string, { present: boolean; value: string | null }> = {};
  for (const k of SECURITY_HEADER_KEYS) {
    const present = !!o.headers[k];
    headerPresent[k] = present;
    securityHeaders[k] = { present, value: present ? String(o.headers[k]).slice(0, 200) : null };
  }
  const cookies = cookiePosture(o.setCookies);
  const rules = buildRules(o, dns, sec, daysRemaining, headerPresent, cookies);

  const scoringBreakdown: ScoringContribution[] = [{ key: 'base', label: 'Baseline', points: 100, observed: 'start' }];
  const findings: Finding[] = [];
  for (const r of rules) {
    if (!r.when) continue;
    scoringBreakdown.push({ key: r.key, label: r.label, points: r.points, observed: r.observed });
    if (r.finding) findings.push({ id: r.key, ...r.finding });
  }
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.id.localeCompare(b.id));

  let score = clamp(scoringBreakdown.reduce((s, c) => s + c.points, 0));
  const criticalTransport = rules.some((r) => r.when && (r.key === 'tls_broken' || r.key === 'cert_expired'));
  let riskBand: VendorSecurityAssessmentReport['riskBand'] = criticalTransport ? 'critical' : score >= 85 ? 'strong' : score >= 65 ? 'adequate' : score >= 40 ? 'weak' : 'critical';
  if (criticalTransport) score = Math.min(score, 39);

  return {
    service: 'vendor_security_assessment',
    version: 1,
    methodologyVersion: METHODOLOGY_VERSION,
    scoringVersion: SCORING_VERSION,
    requestedUrl: input.url,
    finalUrl: o.finalUrl,
    hostname,
    pageTitle: o.pageTitle,
    assessmentStartedAtUtc: new Date(startedAtMs).toISOString(),
    assessmentEndedAtUtc: new Date(endedAtMs).toISOString(),
    durationMs: Math.max(0, endedAtMs - startedAtMs),
    httpStatus: o.httpStatus,
    redirectChain: o.redirectChain.slice(0, 10),
    contentType: o.contentType,
    sampledByteLength: o.sampledByteLength,
    tls: {
      ok: o.tls.ok,
      protocol: o.tls.protocol,
      authorized: o.tls.authorized,
      certIssuer: o.tls.certIssuer,
      certSubject: o.tls.certSubject,
      validFromUtc: o.tls.validFromUtc,
      validToUtc: o.tls.validToUtc,
      daysRemaining,
      hostnameMatch: o.tls.hostnameMatch,
      ...(o.tls.error ? { error: o.tls.error } : {}),
    },
    securityHeaders,
    cookies,
    dns,
    securityTxt: sec,
    findings,
    score,
    riskBand,
    scoringBreakdown,
    limitations: 'Passive public-surface evidence only (HTTPS/TLS, response headers, cookie flags, public DNS/mail records and security.txt). Not a penetration test, vulnerability scan, or certification. No authentication, exploitation, port scanning or page-JavaScript execution was performed.',
  };
}

/** Full assessment: gather observations via the injected observers, then compose. */
export async function assessVendor(input: { url: string }, obs: VendorObservers): Promise<VendorSecurityAssessmentReport> {
  const started = obs.now();
  const http = await obs.probe(input.url);
  const host = safeHost(http.finalUrl) || safeHost(input.url);
  const [dns, sec] = await Promise.all([obs.dns(host), obs.securityTxt(host)]);
  const ended = obs.now();
  return assessFromObservations(input, http, dns, sec, started, ended, obs.now());
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
