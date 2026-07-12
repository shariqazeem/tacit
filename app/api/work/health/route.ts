// Tacit Work — readiness probe for the /work product. Contacts the loopback
// runner health endpoints (private env) and the devnet ledger, and returns ONLY
// safe public info. `/work` enables procurement only when ok === true.
import { NextResponse } from 'next/server';
import { LEDGER_MODE_ACTIVE, PACKAGE_ID, ledgerReachable } from '@/app/lens/ledger/client';
import { WORK_SCHEMA, type WorkHealth, type RunnerHealth } from '@/app/lens/ledger/workTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WORK_PKG = process.env.TACIT_WORK_PACKAGE_NAME || '';
const WORK_PKG_ID = process.env.TACIT_WORK_PACKAGE_ID || '9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed';
const CORE_PKG_ID = PACKAGE_ID || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';
const HEALTH_URLS = (process.env.TACIT_RUNNER_HEALTH_URLS || 'http://127.0.0.1:7011,http://127.0.0.1:7012,http://127.0.0.1:7013')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Read ONE runner's loopback health; return only the safe fields (no paths/secrets). */
async function fetchRunner(u: string): Promise<RunnerHealth | null> {
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
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const mode = LEDGER_MODE_ACTIVE;
  const reachable = await ledgerReachable().catch(() => false);
  const runners = (await Promise.all(HEALTH_URLS.map(fetchRunner))).filter(Boolean) as RunnerHealth[];

  const distinctInstances = runners.length > 0 && new Set(runners.map((r) => r.instanceId)).size === runners.length;
  const distinctProcesses = runners.length > 0 && new Set(runners.map((r) => r.pid)).size === runners.length;
  const distinctParties = new Set(runners.map((r) => r.partyShort)).size === runners.length;
  const threeReady = runners.length >= 3;
  const allDevnet = runners.length > 0 && runners.every((r) => r.ledgerMode === 'devnet');
  const workConfigured = !!WORK_PKG;

  const ok = mode === 'devnet' && reachable && workConfigured && threeReady && distinctInstances && distinctProcesses && distinctParties && allDevnet;

  let reason: string | undefined;
  if (!ok) {
    if (mode !== 'devnet') reason = 'ledger mode is not devnet';
    else if (!workConfigured) reason = 'tacit-work is not configured (TACIT_WORK_PACKAGE_NAME)';
    else if (!reachable) reason = 'Canton devnet is unreachable';
    else if (!threeReady) reason = `only ${runners.length}/3 provider runners are ready`;
    else if (!distinctInstances || !distinctProcesses || !distinctParties) reason = 'provider runner identities are not distinct';
    else if (!allDevnet) reason = 'a provider runner is not on devnet';
    else reason = 'work network not ready';
  }

  const body: WorkHealth = {
    ok,
    schema: WORK_SCHEMA,
    mode,
    ledgerReachable: reachable,
    corePackage: { name: 'tacit', shortId: CORE_PKG_ID.slice(0, 8) },
    workPackage: { name: 'tacit-work', shortId: WORK_PKG_ID.slice(0, 8) },
    runners,
    distinctInstances,
    distinctProcesses,
    reason,
  };
  return NextResponse.json(body);
}
