// SSRF protection for auditing a user-supplied URL. HTTPS + :443 only, no
// credentials, no localhost; DNS-resolve and reject private/loopback/link-local/
// multicast/reserved/metadata addresses (IPv4 + IPv6) BEFORE and on every redirect.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SsrfError';
  }
}

/** Validate scheme/port/host shape (no network). Returns the parsed URL. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError('invalid URL');
  }
  if (u.protocol !== 'https:') throw new SsrfError('only https:// is allowed');
  if (u.username || u.password) throw new SsrfError('embedded credentials are not allowed');
  const port = u.port === '' ? '443' : u.port;
  if (port !== '443') throw new SsrfError('only port 443 is allowed');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new SsrfError('localhost is not allowed');
  return u;
}

const ipv4ToInt = (ip: string): number => {
  const p = ip.split('.').map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
const inRange = (ip: number, cidr: string): boolean => {
  const [base, bits] = cidr.split('/');
  const b = ipv4ToInt(base);
  const n = Number(bits);
  const mask = n === 0 ? 0 : (~((1 << (32 - n)) - 1)) >>> 0;
  return (ip & mask) === (b & mask);
};
const V4_FORBIDDEN = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16',
  '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4',
  '240.0.0.0/4', '255.255.255.255/32',
];
function isForbiddenV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_FORBIDDEN.some((r) => inRange(n, r));
}
function isForbiddenV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;                       // loopback / unspecified
  if (s.startsWith('::ffff:')) {                                    // IPv4-mapped
    const m = s.split('::ffff:').pop() || '';
    return net.isIP(m) === 4 ? isForbiddenV4(m) : true;
  }
  if (/^f[cd]/.test(s)) return true;                                // fc00::/7 ULA
  if (/^fe[89ab]/.test(s)) return true;                             // fe80::/10 link-local
  if (s.startsWith('ff')) return true;                              // multicast
  return false;
}

/** True if an already-resolved literal IP must be rejected. */
export function isForbiddenIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isForbiddenV4(ip);
  if (v === 6) return isForbiddenV6(ip);
  return true; // unknown → reject
}

/** Resolve a hostname and reject if ANY resolved address is forbidden. */
export async function resolveAndCheck(hostname: string): Promise<string[]> {
  // A literal IP host is checked directly.
  if (net.isIP(hostname)) {
    if (isForbiddenIp(hostname)) throw new SsrfError(`forbidden address ${hostname}`);
    return [hostname];
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfError('DNS resolution failed');
  }
  if (!addrs.length) throw new SsrfError('DNS resolution returned no addresses');
  for (const a of addrs) if (isForbiddenIp(a.address)) throw new SsrfError(`forbidden resolved address ${a.address}`);
  return addrs.map((a) => a.address);
}
