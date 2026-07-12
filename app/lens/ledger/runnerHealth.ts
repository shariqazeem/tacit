// Server-only: read the loopback provider-runner health endpoints and expose ONLY
// safe fields. Shared by /api/work/health and /api/work/services so they never drift.
import type { RunnerHealth, ServiceQuorum } from './workTypes';

const HEALTH_URLS = (process.env.TACIT_RUNNER_HEALTH_URLS || 'http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013')
  .split(',').map((s) => s.trim()).filter(Boolean);

async function fetchOne(u: string): Promise<RunnerHealth | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(u.replace(/\/$/, '') + '/health', { signal: ctrl.signal });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j?.ready) return null;
    return {
      ready: true,
      label: String(j.label || ''),
      instanceId: String(j.instanceId || ''),
      pid: Number(j.pid || 0),
      partyShort: String(j.partyShort || ''),
      ledgerMode: String(j.ledgerMode || ''),
      services: Array.isArray(j.services) ? j.services.map(String) : [],
      state: typeof j.state === 'string' ? j.state : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchRunners(): Promise<RunnerHealth[]> {
  return (await Promise.all(HEALTH_URLS.map(fetchOne))).filter(Boolean) as RunnerHealth[];
}

/** Distinct ready runners advertising `serviceId`; quorum = at least 3. */
export function quorumFor(runners: RunnerHealth[], serviceId: string): ServiceQuorum {
  const supporting = new Set(runners.filter((r) => (r.services || []).includes(serviceId)).map((r) => r.instanceId));
  return { supported: supporting.size, quorum: supporting.size >= 3 };
}
