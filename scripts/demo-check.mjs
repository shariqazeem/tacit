// Tacit — demo readiness check. READ-ONLY by default: it verifies the HTTPS app,
// a trusted certificate, devnet mode, three ready provider runners, and the key
// routes — WITHOUT creating any ledger job. Pass --full to also run the real work
// preflight (which DOES create one fresh devnet job).
//
//   npm run demo:check                 # read-only
//   npm run demo:check -- --full       # + one real work procurement
//   APP_URL=https://host npm run demo:check
import { spawnSync } from 'node:child_process';

const APP_URL = (process.env.APP_URL || 'https://tacit.80-225-209-190.sslip.io').replace(/\/$/, '');
const FULL = process.argv.includes('--full');

let fails = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.error('  ❌ ' + m); fails++; };

async function head(path, expect = 200) {
  try {
    const r = await fetch(APP_URL + path, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    return r.status === expect;
  } catch (e) {
    return false;
  }
}

console.log(`Tacit demo check → ${APP_URL}${FULL ? ' (--full: will create ONE devnet job)' : ' (read-only)'}\n`);

// 1) HTTPS + trusted cert (node fetch rejects an untrusted/hostname-mismatched cert)
if (APP_URL.startsWith('https://')) {
  try {
    await fetch(APP_URL + '/', { signal: AbortSignal.timeout(12000) });
    ok('HTTPS reachable with a publicly-trusted certificate (hostname matches)');
  } catch (e) {
    bad(`HTTPS/cert check failed: ${String(e?.message || e)}`);
  }
} else {
  bad('APP_URL is not https:// — set the HTTPS origin');
}

// 2) devnet work health: ok + devnet + 3 distinct ready runners + work package configured
try {
  const r = await fetch(APP_URL + '/api/work/health', { signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  (j?.mode === 'devnet') ? ok('ledger mode is devnet (no fallback)') : bad(`ledger mode is ${j?.mode}, expected devnet`);
  (j?.ledgerReachable === true) ? ok('Canton devnet reachable') : bad('Canton devnet unreachable');
  (Array.isArray(j?.runners) && j.runners.length >= 3 && j.distinctInstances && j.distinctProcesses)
    ? ok(`3 distinct provider runners ready (${(j.runners || []).map((x) => x.label).join(', ')})`)
    : bad(`provider runners not ready (${j?.runners?.length ?? 0}/3; ${j?.reason || ''})`);
  (j?.workPackage?.shortId) ? ok(`tacit-work configured (${j.workPackage.shortId}…)`) : bad('tacit-work not configured');
  (j?.ok === true) ? ok('work health ok === true') : bad(`work health ok=false (${j?.reason || ''})`);
} catch (e) {
  bad(`/api/work/health failed: ${String(e?.message || e)}`);
}

// 3) key routes
for (const [p, label] of [['/', 'landing /'], ['/work', 'product /work'], ['/lens', 'ledger lens /lens'], ['/api/health', '/api/health']]) {
  (await head(p)) ? ok(`${label} → 200`) : bad(`${label} not 200`);
}

if (fails) {
  console.error(`\n❌ demo NOT ready — ${fails} check(s) failed.`);
  process.exit(1);
}
console.log('\n✅ demo READY — HTTPS, trusted cert, devnet, 3 runners, routes live. No ledger job created.');

if (FULL) {
  console.log('\n--- --full: running the real work preflight (creates one devnet job) ---');
  const r = spawnSync('node', ['scripts/preflight-work-e2e.mjs', '--require-ledger', '--require-runners'], {
    stdio: 'inherit', env: { ...process.env, APP_URL },
  });
  process.exit(r.status ?? 1);
}
