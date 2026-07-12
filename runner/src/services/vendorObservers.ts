// REAL passive observers for vendor_security_assessment (runner-only; node built-ins).
// Every outbound connection PINS a resolved+SSRF-checked IP (servername + Host set to
// the real hostname) to prevent DNS rebinding, and every redirect is re-validated.
// Passive only: GET, bounded, no auth/JS/forms/scanning.
import https from 'node:https';
import tls from 'node:tls';
import { resolve as dnsResolve } from 'node:dns/promises';
import { assertSafeUrl, resolveAndCheck, SsrfError } from '../ssrf.js';
import type { DnsObservation, HttpTlsObservation, SecTxtObservation, VendorObservers } from './vendorAssessment.js';

const UA = 'TacitVendorAssessment/1.0 (+passive-security-posture)';
const MAX_REDIRECTS = 5;
const MAX_BODY = 256 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_SETCOOKIE = 25;

interface RawResp {
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  body: string;
  bodyBytes: number;
  socket: tls.TLSSocket;
}

/** One pinned HTTPS GET to `url` using an already SSRF-checked IP. */
function pinnedGet(url: URL, pinnedIp: string): Promise<RawResp> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: pinnedIp, // connect to the checked IP (no re-resolution)
        servername: url.hostname, // correct SNI
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Host: url.hostname, 'User-Agent': UA, Accept: 'text/html,*/*' },
        rejectUnauthorized: false, // observe invalid certs rather than fail; we report authorized separately
        timeout: TIMEOUT_MS,
        agent: false,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k === 'set-cookie') continue;
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
        }
        const setCookies = (res.headers['set-cookie'] || []).slice(0, MAX_SETCOOKIE);
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total <= MAX_BODY) chunks.push(c);
          else res.destroy();
        });
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, headers, setCookies, body: Buffer.concat(chunks).subarray(0, MAX_BODY).toString('utf8'), bodyBytes: total, socket: res.socket as tls.TLSSocket }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Resolve + SSRF-check a hostname, returning the first allowed IP (pins that IP). */
async function checkedIp(hostname: string): Promise<string> {
  const addrs = await resolveAndCheck(hostname); // throws on any forbidden address
  if (!addrs.length) throw new SsrfError('no resolved address');
  return addrs[0];
}

async function probe(inputUrl: string): Promise<HttpTlsObservation> {
  let current = assertSafeUrl(inputUrl);
  const redirectChain: string[] = [];
  let last: RawResp | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const ip = await checkedIp(current.hostname);
    last = await pinnedGet(current, ip);
    const loc = last.headers['location'];
    if ([301, 302, 303, 307, 308].includes(last.status) && loc) {
      const next = assertSafeUrl(new URL(loc, current).toString()); // enforces https + :443 (no downgrade)
      redirectChain.push(next.toString());
      if (i === MAX_REDIRECTS) throw new SsrfError('too many redirects');
      current = next;
      continue;
    }
    break;
  }
  const r = last!;
  const cert: any = r.socket.getPeerCertificate?.() || {};
  const hasCert = cert && Object.keys(cert).length > 0;
  let hostnameMatch: boolean | null = null;
  try {
    hostnameMatch = hasCert ? tls.checkServerIdentity(current.hostname, cert) === undefined : null;
  } catch {
    hostnameMatch = false;
  }
  const title = (r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  return {
    ok: r.status > 0,
    httpStatus: r.status,
    finalUrl: current.toString(),
    redirectChain,
    contentType: r.headers['content-type'] || null,
    sampledByteLength: r.bodyBytes,
    pageTitle: title,
    headers: r.headers,
    setCookies: r.setCookies,
    tls: {
      ok: !!r.socket.getProtocol?.(),
      protocol: r.socket.getProtocol?.() || null,
      authorized: !!r.socket.authorized,
      certIssuer: hasCert && cert.issuer ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(' / ').slice(0, 120) : null,
      certSubject: hasCert && cert.subject ? String(cert.subject.CN || '').slice(0, 120) : null,
      validFromUtc: hasCert && cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
      validToUtc: hasCert && cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
      hostnameMatch,
      ...(r.socket.authorized ? {} : { error: String((r.socket as any).authorizationError || 'unauthorized') }),
    },
  };
}

async function dns(hostname: string): Promise<DnsObservation> {
  const q = async (fn: () => Promise<any[]>): Promise<'present' | 'absent' | 'unavailable'> => {
    try {
      const r = await fn();
      return r && r.length ? 'present' : 'absent';
    } catch (e: any) {
      return e?.code === 'ENODATA' || e?.code === 'ENOTFOUND' ? 'absent' : 'unavailable';
    }
  };
  const txt = async (name: string, prefix: string): Promise<'present' | 'absent' | 'unavailable'> => {
    try {
      const rows: string[][] = (await dnsResolve(name, 'TXT')) as any;
      const flat = rows.slice(0, 50).map((r) => r.join('').toLowerCase());
      return flat.some((v) => v.startsWith(prefix)) ? 'present' : 'absent';
    } catch (e: any) {
      return e?.code === 'ENODATA' || e?.code === 'ENOTFOUND' ? 'absent' : 'unavailable';
    }
  };
  const [caa, mx, spf, dmarc] = await Promise.all([
    q(() => dnsResolve(hostname, 'CAA') as any),
    q(() => dnsResolve(hostname, 'MX') as any),
    txt(hostname, 'v=spf1'),
    txt(`_dmarc.${hostname}`, 'v=dmarc1'),
  ]);
  return { caa, mx, spf, dmarc };
}

async function securityTxt(hostname: string): Promise<SecTxtObservation> {
  try {
    const ip = await checkedIp(hostname);
    const r = await pinnedGet(new URL(`https://${hostname}/.well-known/security.txt`), ip);
    return { status: r.status >= 200 && r.status < 300 ? 'present' : 'absent', httpStatus: r.status };
  } catch {
    return { status: 'unavailable', httpStatus: null };
  }
}

export const realObservers: VendorObservers = { probe, dns, securityTxt, now: () => Date.now() };
