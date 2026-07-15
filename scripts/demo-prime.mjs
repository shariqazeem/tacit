// Tacit — demo:prime. The button you press before recording the video and before
// judging hours. Runs ONE real job per service (fresh jobIds) through HTTPS, then
// prints a demo-readiness checklist: health 3/3 per service, top of the market feed,
// planner smoke 6/6, and TLS cert days remaining. Honest: any real failure is shown.
//
//   APP_URL=https://host npm run demo:prime
import { spawnSync } from 'node:child_process';
import tls from 'node:tls';

const APP_URL = (process.env.APP_URL || 'https://tacit.80-225-209-190.sslip.io').replace(/\/$/, '');
const host = new URL(APP_URL).hostname;
const checks = [];
const add = (ok, label, detail = '') => checks.push({ ok, label, detail });

async function jget(path, t = 20000) {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), t);
  try { const r = await fetch(APP_URL + path, { signal: c.signal }); return { status: r.status, json: await r.json().catch(() => null) }; }
  catch (e) { return { status: 0, json: null, err: String(e?.message || e) }; }
  finally { clearTimeout(timer); }
}
async function procure(serviceType, policyId, t = 180000) {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), t);
  const jobId = `prime-${serviceType.slice(0, 4)}-${Date.now().toString(36)}`;
  try {
    const r = await fetch(APP_URL + '/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId, serviceType, input: { url: 'https://example.com' }, maxBudget: 100, policyId, buyerName: 'Judge-Agent' }), signal: c.signal });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) { return { status: 0, json: null, err: String(e?.message || e) }; }
  finally { clearTimeout(timer); }
}
function certDaysRemaining(hostname) {
  return new Promise((resolve) => {
    try {
      const s = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000 }, () => {
        const cert = s.getPeerCertificate();
        s.end();
        if (!cert || !cert.valid_to) return resolve(null);
        resolve(Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000));
      });
      s.on('error', () => resolve(null));
      s.on('timeout', () => { s.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

console.log(`Tacit demo:prime → ${APP_URL}\n`);

// 1) health + per-service quorum
const h = (await jget('/api/work/health', 15000)).json;
const runnersReady = Array.isArray(h?.runners) && h.runners.length >= 3 && h.distinctInstances;
add(h?.mode === 'devnet' && h?.ledgerReachable, 'Canton devnet reachable (mode=devnet)');
add(runnersReady, `3 distinct provider runners ready (${h?.runners?.length ?? 0})`);
for (const s of ['vendor_security_assessment', 'web_performance_probe']) {
  add(h?.serviceQuorum?.[s]?.quorum === true, `${s} has a 3-runner quorum`);
}

// 2) one real job per service (WRITES — needs the devnet to accept commands)
console.log('Priming one real job per service…');
const vendor = await procure('vendor_security_assessment', 'standard-saas-v1');
add(vendor.status === 200 && vendor.json?.ok, `vendor job settled${vendor.json?.ok ? ` — ${vendor.json.winner?.providerLabel} @ ${vendor.json.amount}` : ` — ${String(vendor.json?.error || vendor.err).slice(0, 80)}`}`);
const perf = await procure('web_performance_probe', 'latency-slo-standard-v1');
add(perf.status === 200 && perf.json?.ok, `perf job settled${perf.json?.ok ? ` — ${perf.json.winner?.providerLabel} @ ${perf.json.amount}` : ` — ${String(perf.json?.error || perf.err).slice(0, 80)}`}`);

// 3) market feed top
const m = (await jget('/api/market/overview', 20000)).json;
const top = m?.receipts?.[0];
add(m?.available === true && !!top, `market feed live${top ? ` — top: ${top.winnerLabel} · ${top.amount} · ${top.serviceType}` : ''}`);

// 4) planner smoke (6/6)
console.log('Running planner smoke (6 calls)…');
const smoke = spawnSync('node', ['scripts/planner-smoke.mjs'], { encoding: 'utf8', env: { ...process.env, APP_URL } });
const smokeLine = (smoke.stdout || '').trim().split('\n').filter((l) => /planner smoke:/.test(l)).pop() || '(no smoke output)';
add(smoke.status === 0, `planner smoke — ${smokeLine.replace(/^[^:]*:\s*/, '').trim() || smokeLine}`);

// 5) cert days remaining
const days = await certDaysRemaining(host);
add(days != null && days > 3, `TLS cert valid — ${days == null ? 'unknown' : days + ' days remaining'}`);

console.log('\n=== DEMO READINESS ===');
for (const c of checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
const ready = checks.every((c) => c.ok);
console.log(`\n${ready ? '✅ DEMO READY — press record.' : '❌ NOT READY — resolve the ❌ items above.'}`);
process.exit(ready ? 0 : 1);
