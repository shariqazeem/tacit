// Runner configuration — entirely from private env. Secrets are never logged.
export interface RunnerConfig {
  // identity
  providerId: string; // providerA | providerB | providerC (logical)
  party: string; // full pinned Canton party id (Name::fingerprint)
  label: string; // display label, e.g. "Provider A"
  instanceId: string; // unique per runner process
  healthPort: number; // 127.0.0.1 health port
  // private pricing policy (never returned to the buyer, never on-ledger)
  baseCost: number;
  margin: number;
  minPrice: number; // private floor; runner declines below this
  pollMs: number;
  stateFile: string;
  services: string[]; // advertised service capabilities (registered ids)
  // ledger (5North devnet)
  apiUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  scope: string;
  userId: string;
  // packages (by name)
  tacitPkg: string; // "tacit"
  workPkg: string; // "tacit-work"
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env ${name}`);
  return v;
}
const num = (name: string, def: number): number => {
  const v = process.env[name];
  const n = v ? Number(v) : def;
  if (!isFinite(n)) throw new Error(`env ${name} must be a number`);
  return n;
};

export function loadConfig(): RunnerConfig {
  return {
    providerId: req('RUNNER_PROVIDER_ID'),
    party: req('RUNNER_PARTY'),
    label: process.env.RUNNER_LABEL || req('RUNNER_PROVIDER_ID'),
    instanceId: process.env.RUNNER_INSTANCE_ID || `${req('RUNNER_PROVIDER_ID')}-${process.pid}`,
    healthPort: num('RUNNER_HEALTH_PORT', 0),
    baseCost: num('RUNNER_BASE_COST', 20),
    margin: num('RUNNER_MARGIN', 0.35),
    minPrice: num('RUNNER_MIN_PRICE', 1),
    pollMs: num('RUNNER_POLL_MS', 2500),
    stateFile: process.env.RUNNER_STATE_FILE || `/tmp/tacit-runner-${req('RUNNER_PROVIDER_ID')}.json`,
    // Advertise ONLY services this runner can actually execute. Phase 1 ships the
    // site_audit adapter; the vendor adapter (and its advertisement) arrives in Phase 3.
    services: (process.env.RUNNER_SERVICES || 'site_audit')
      .split(',').map((s) => s.trim()).filter(Boolean),
    apiUrl: req('TACIT_V2_API_URL'),
    tokenUrl: req('TACIT_DEVNET_TOKEN_URL'),
    clientId: req('TACIT_DEVNET_CLIENT_ID'),
    clientSecret: req('TACIT_DEVNET_CLIENT_SECRET'),
    audience: process.env.TACIT_DEVNET_AUDIENCE || '',
    scope: process.env.TACIT_DEVNET_SCOPE || 'daml_ledger_api',
    userId: req('TACIT_V2_USER_ID'),
    tacitPkg: process.env.TACIT_PACKAGE_NAME || 'tacit',
    workPkg: process.env.TACIT_WORK_PACKAGE_NAME || 'tacit-work',
  };
}
