/**
 * Health Check API Endpoint
 *
 * Container monitoring (memory/uptime) PLUS Tacit deployment smoke-test info:
 * Canton JSON API reachability, configured ledger URL, and package id — with no
 * secrets leaked. Used by /scripts/preflight.mjs and for demo confidence.
 */

import { NextResponse } from 'next/server';
import { ledgerHealth, LEDGER_URL, PACKAGE_ID, PACKAGE_ID_FROM_ENV } from '@/app/lens/ledger/client';

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
      status: memoryHealth.healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      memory: { healthy: memoryHealth.healthy, usagePercent: memoryHealth.usage },
      canton: {
        reachable: canton.reachable,
        ledgerUrl: LEDGER_URL, // host:port only — no tokens/secrets
        error: canton.error,
      },
      packageId: {
        short: PACKAGE_ID.slice(0, 8) + '…',
        fromEnv: PACKAGE_ID_FROM_ENV,
        warning: PACKAGE_ID_FROM_ENV ? null : 'using hardcoded default — set TACIT_PACKAGE_ID after rebuilding the DAR',
      },
    };

    // HTTP status is driven by memory (container health) only. Canton being
    // unreachable is NOT unhealthy — the app runs in deterministic fallback.
    return NextResponse.json(healthData, { status: memoryHealth.healthy ? 200 : 503 });
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
