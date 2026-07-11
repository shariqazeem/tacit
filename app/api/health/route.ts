/**
 * Health Check API Endpoint
 *
 * Container monitoring (memory/uptime) PLUS Tacit deployment smoke-test info:
 * Canton JSON API reachability, configured ledger URL, and package id — with no
 * secrets leaked. Used by /scripts/preflight.mjs and for demo confidence.
 */

import { NextResponse } from 'next/server';
import { ledgerHealth, LEDGER_URL, LEDGER_MODE_ACTIVE, PACKAGE_ID, PACKAGE_ID_FROM_ENV } from '@/app/lens/ledger/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const startTime = Date.now();

function checkMemoryHealth(): { healthy: boolean; usage: number } {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;
    return { healthy: usagePercent < 90, usage: Math.round(usagePercent) };
  }
  return { healthy: true, usage: 0 };
}

export async function GET() {
  try {
    const memoryHealth = checkMemoryHealth();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const canton = await ledgerHealth();

    const healthData = {
      app: 'ok',
      // The app is healthy when it is serving + (for the demo) the ledger is
      // reachable. Node heap ratio is reported below as info only — it runs
      // near-full by design and must NOT gate health (it caused false 503s).
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      memory: { healthy: memoryHealth.healthy, usagePercent: memoryHealth.usage },
      canton: {
        reachable: canton.reachable,
        // Which ledger this build targets — drives the honest 3-state badge.
        mode: LEDGER_MODE_ACTIVE, // 'sandbox' | 'canton3-local' | 'devnet'
        ledgerUrl: LEDGER_URL, // host:port only — no tokens/secrets
        partyCount: canton.partyCount ?? null,
        error: canton.error,
      },
      packageId: {
        short: PACKAGE_ID.slice(0, 8) + '…',
        fromEnv: PACKAGE_ID_FROM_ENV,
        warning: PACKAGE_ID_FROM_ENV ? null : 'using hardcoded default — set TACIT_PACKAGE_ID after rebuilding the DAR',
      },
    };

    // Always 200 when the app is serving. Canton-unreachable is not unhealthy
    // (deterministic fallback); Node heap ratio is info, not a health gate.
    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        app: 'error',
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
