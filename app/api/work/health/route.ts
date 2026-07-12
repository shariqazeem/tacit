// Tacit Work — readiness probe for the /work product. Contacts the loopback
// runner health endpoints (private env) and the devnet ledger, and returns ONLY
// safe public info. `/work` enables procurement only when ok === true AND the
// requested service has a 3-runner capability quorum.
import { NextResponse } from 'next/server';
import { LEDGER_MODE_ACTIVE, PACKAGE_ID, ledgerReachable } from '@/app/lens/ledger/client';
import { WORK_SCHEMA, type WorkHealth, type ServiceQuorum } from '@/app/lens/ledger/workTypes';
import { fetchRunners, quorumFor } from '@/app/lens/ledger/runnerHealth';
import { SERVICE_IDS, DEFAULT_SERVICE } from '@/shared/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WORK_PKG = process.env.TACIT_WORK_PACKAGE_NAME || '';
const WORK_PKG_ID = process.env.TACIT_WORK_PACKAGE_ID || '9ab077f2392651a0a10df2233440570b11a7556a27fc4de31db3e775ae0ed0ed';
const CORE_PKG_ID = PACKAGE_ID || 'fdfbfcf0030194e0a70899d6f9d0d16eb4989459096ad763128240ae43b14cff';

export async function GET() {
  const mode = LEDGER_MODE_ACTIVE;
  const reachable = await ledgerReachable().catch(() => false);
  const runners = await fetchRunners();

  const distinctInstances = runners.length > 0 && new Set(runners.map((r) => r.instanceId)).size === runners.length;
  const distinctProcesses = runners.length > 0 && new Set(runners.map((r) => r.pid)).size === runners.length;
  const distinctParties = new Set(runners.map((r) => r.partyShort)).size === runners.length;
  const threeReady = runners.length >= 3;
  const allDevnet = runners.length > 0 && runners.every((r) => r.ledgerMode === 'devnet');
  const workConfigured = !!WORK_PKG;

  const serviceQuorum: Record<string, ServiceQuorum> = {};
  for (const sid of SERVICE_IDS) serviceQuorum[sid] = quorumFor(runners, sid);

  // `ok` = base readiness (3 distinct ready runners on devnet). Per-service readiness
  // (does the launch service have a 3-runner capability quorum?) lives in serviceQuorum
  // and is enforced at procure time + surfaced in the UI; this keeps legacy site_audit
  // healthy while the vendor adapter's quorum lands in Phase 3.
  const ok = mode === 'devnet' && reachable && workConfigured && threeReady && distinctInstances && distinctProcesses && distinctParties && allDevnet;
  const launchReady = ok && serviceQuorum[DEFAULT_SERVICE]?.quorum === true;

  let reason: string | undefined;
  if (!ok) {
    if (mode !== 'devnet') reason = 'ledger mode is not devnet';
    else if (!workConfigured) reason = 'tacit-work is not configured (TACIT_WORK_PACKAGE_NAME)';
    else if (!reachable) reason = 'Canton devnet is unreachable';
    else if (!threeReady) reason = `only ${runners.length}/3 provider runners are ready`;
    else if (!distinctInstances || !distinctProcesses || !distinctParties) reason = 'provider runner identities are not distinct';
    else if (!allDevnet) reason = 'a provider runner is not on devnet';
    else reason = 'work network not ready';
  } else if (!launchReady) {
    reason = `${DEFAULT_SERVICE} is supported by ${serviceQuorum[DEFAULT_SERVICE]?.supported ?? 0}/3 runners`;
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
    serviceQuorum,
    launchService: DEFAULT_SERVICE,
    launchReady,
    reason,
  };
  return NextResponse.json(body);
}
