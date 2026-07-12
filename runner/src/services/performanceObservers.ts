// REAL performance observers for web_performance_probe (runner-only; node built-ins).
// Every connection PINS a resolved + SSRF-checked IP (servername + Host set to the real
// hostname) to prevent DNS rebinding; every redirect is re-validated (no HTTPS→HTTP
// downgrade). Bounded: per-request 10s timeout, 256 KiB body cap, ≤5 redirects.
import https from 'node:https';
import tls from 'node:tls';
import { assertSafeUrl, resolveAndCheck, SsrfError } from '../ssrf.js';
import type { PerfObservers, TargetObservation } from './performanceProbe.js';
import type { PerfSample } from '../_shared.js';

const UA = 'TacitWebPerformanceProbe/1.0 (+bounded-performance-prescreen)';
const MAX_REDIRECTS = 5;
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 10_000;

async function checkedIp(hostname: string): Promise<string> {
  const addrs = await resolveAndCheck(hostname); // throws on any forbidden/rebinding address
  if (!addrs.length) throw new SsrfError('no resolved address');
  return addrs[0];
}

interface HeadResp {
  status: number;
  headers: Record<string, string>;
}

/** One pinned GET that reads (and bounds) the body; returns status + lowercased headers. */
function pinnedGet(url: URL, ip: string): Promise<HeadResp> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: ip, servername: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET', headers: { Host: url.hostname, 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': 'gzip, br, zstd' }, rejectUnauthorized: false, timeout: TIMEOUT_MS, agent: false },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k === 'set-cookie') continue;
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
        }
        let total = 0;
        res.on('data', (c: Buffer) => { total += c.length; if (total > MAX_BYTES) res.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode || 0, headers }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** ALPN probe: does the server offer HTTP/2? (Timings measured separately over HTTP/1.1.) */
function alpnProbe(hostname: string): Promise<string> {
  return new Promise((resolve) => {
    (async () => {
      let ip: string;
      try { ip = await checkedIp(hostname); } catch { return resolve('HTTP/1.1'); }
      const socket = tls.connect({ host: ip, servername: hostname, port: 443, ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
        const alpn = socket.alpnProtocol;
        socket.destroy();
        resolve(alpn === 'h2' ? 'HTTP/2' : 'HTTP/1.1');
      });
      socket.on('timeout', () => { socket.destroy(); resolve('HTTP/1.1'); });
      socket.on('error', () => resolve('HTTP/1.1'));
    })();
  });
}

async function resolveTarget(inputUrl: string): Promise<TargetObservation> {
  let current = assertSafeUrl(inputUrl);
  let redirectCount = 0;
  let last: HeadResp | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const ip = await checkedIp(current.hostname);
    last = await pinnedGet(current, ip);
    const loc = last.headers['location'];
    if ([301, 302, 303, 307, 308].includes(last.status) && loc) {
      const next = assertSafeUrl(new URL(loc, current).toString()); // enforces https + :443 (no downgrade)
      redirectCount++;
      if (i === MAX_REDIRECTS) throw new SsrfError('too many redirects');
      current = next;
      continue;
    }
    break;
  }
  const httpVersion = await alpnProbe(current.hostname);
  return { finalUrl: current.toString(), host: current.hostname.toLowerCase(), redirectCount, status: last!.status, httpVersion, headers: last!.headers };
}

/** One FRESH-connection timed sample (no keep-alive reuse): TCP connect, TLS, TTFB, total. */
function sample(finalUrl: string): Promise<PerfSample> {
  return new Promise((resolve, reject) => {
    (async () => {
      let u: URL, ip: string;
      try { u = assertSafeUrl(finalUrl); ip = await checkedIp(u.hostname); } catch (e) { return reject(e); }
      const t0 = Date.now();
      let tcpAt = 0, tlsAt = 0, firstByteAt = 0, bytes = 0, status = 0;
      const req = https.request(
        { host: ip, servername: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', headers: { Host: u.hostname, 'User-Agent': UA, Accept: '*/*' }, rejectUnauthorized: false, timeout: TIMEOUT_MS, agent: false },
        (res) => {
          status = res.statusCode || 0;
          res.on('data', (c: Buffer) => { if (!firstByteAt) firstByteAt = Date.now(); bytes += c.length; if (bytes > MAX_BYTES) res.destroy(); });
          res.on('end', () => resolve({
            connectMs: Math.max(0, (tcpAt || t0) - t0),
            tlsMs: Math.max(0, tlsAt - (tcpAt || tlsAt)),
            ttfbMs: Math.max(0, (firstByteAt || Date.now()) - t0),
            totalMs: Math.max(0, Date.now() - t0),
            status,
            bytesRead: bytes,
          }));
          res.on('error', reject);
        },
      );
      req.on('socket', (s) => {
        s.on('connect', () => { tcpAt = Date.now(); });
        s.on('secureConnect', () => { tlsAt = Date.now(); });
      });
      req.on('timeout', () => req.destroy(new Error('request timed out')));
      req.on('error', reject);
      req.end();
    })();
  });
}

export const realPerfObservers: PerfObservers = { resolveTarget, sample, now: () => Date.now() };
