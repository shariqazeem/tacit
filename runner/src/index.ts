// Tacit provider runner — a standalone autonomous process (NOT inside Next.js).
// It discovers invited work FROM Canton, prices with its PRIVATE local policy,
// creates its OWN SealedBid as its provider party, and — only if it wins — runs
// the real site_audit and delivers the exact bytes through Canton. It never
// receives competitors' bids and never receives a price from the buyer.
import { loadConfig } from './config.js';
import { Canton } from './canton.js';
import { loadState, saveState } from './state.js';
import { startHealth } from './health.js';
import { siteAudit } from './audit.js';

const cfg = loadConfig();
const canton = new Canton(cfg);
const state = loadState(cfg.stateFile);

const T_AWR = `#${cfg.workPkg}:TacitWork:ActiveWorkRequest`;
const T_ASSIGN = `#${cfg.workPkg}:TacitWork:Assignment`;
const T_BID = `#${cfg.tacitPkg}:Tacit.Sealed:SealedBid`;

const partyShort = () => {
  const [name, fp] = cfg.party.split('::');
  return fp ? `${name}::${fp.slice(0, 8)}` : name;
};
let ready = false;
startHealth(cfg.healthPort, () => ({
  ready,
  instanceId: cfg.instanceId,
  pid: process.pid,
  provider: cfg.providerId,
  label: cfg.label,
  partyShort: partyShort(),
  ledgerMode: 'devnet',
}));

const log = (...a: unknown[]) => console.log(`[${cfg.label} ${cfg.instanceId} pid=${process.pid}]`, ...a);

// PRIVATE pricing: runner-local base cost + margin, adjusted by request complexity
// and this runner's current in-flight load. Never a copy of a shared multiplier;
// never returned to the buyer; never placed on Canton.
function priceFor(awr: any): number {
  const budget = Number(awr.maxBudget);
  const inFlight = Math.max(0, Object.keys(state.bids).length - Object.keys(state.deliveries).length);
  const complexity = 1 + Math.min(0.5, String(awr.serviceInput || '').length / 2000); // real signal from the request
  const load = 1 + inFlight * 0.05;
  const raw = cfg.baseCost * (1 + cfg.margin) * complexity * load;
  const clamped = Math.max(cfg.baseCost, Math.min(raw, budget * 0.98));
  return Math.round(clamped * 100) / 100;
}

async function tickBids(): Promise<void> {
  const awrs = await canton.query(cfg.party, T_AWR);
  for (const { payload: awr } of awrs) {
    const jobId = String(awr.jobId);
    if (state.bids[jobId]) continue; // durable: already bid this job
    if (!(awr.invitedProviders || []).includes(cfg.party)) continue;
    const price = priceFor(awr);
    const bidCid = await canton.create(T_BID, { rfsId: awr.rfsId, provider: cfg.party, buyer: awr.buyer, price: String(price) }, [cfg.party]);
    state.bids[jobId] = bidCid;
    saveState(cfg.stateFile, state);
    log(`bid ${price} on ${jobId} → ${bidCid.slice(0, 16)}…`);
  }
}

async function tickDeliveries(): Promise<void> {
  const assigns = await canton.query(cfg.party, T_ASSIGN);
  for (const { contractId, payload: a } of assigns) {
    const jobId = String(a.jobId);
    if (state.deliveries[jobId]) continue;
    if (a.provider !== cfg.party) continue; // only the winner acts
    if (a.serviceType !== 'site_audit') { log('unsupported serviceType', a.serviceType); continue; }
    let input: { url: string };
    try { input = JSON.parse(a.serviceInput); } catch { log('bad serviceInput json'); continue; }
    log(`won ${jobId} — running site_audit on ${input.url}`);
    const { canonical } = await siteAudit({ url: input.url });
    const delivCid = await canton.exercise(
      T_ASSIGN, contractId, 'SubmitDelivery',
      { reportJson: canonical.json, sha256: canonical.sha256, mediaType: 'application/json', byteLen: canonical.byteLen },
      [cfg.party],
    );
    state.deliveries[jobId] = String(delivCid);
    saveState(cfg.stateFile, state);
    log(`delivered ${jobId} sha=${canonical.sha256.slice(0, 16)}… → ${String(delivCid).slice(0, 16)}…`);
  }
}

async function loop(): Promise<void> {
  ready = true;
  log(`up · party ${partyShort()} · polling ${T_AWR}`);
  for (;;) {
    try {
      await tickBids();
      await tickDeliveries();
    } catch (e) {
      log('tick error:', (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
}

loop().catch((e) => { console.error('fatal:', (e as Error).message); process.exit(1); });
