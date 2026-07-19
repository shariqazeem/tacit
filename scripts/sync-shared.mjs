// Copies the authoritative shared service contract into the runner's src tree so
// the standalone runner build (NodeNext) can compile it. The app imports the same
// file directly via @/shared/services. runner/src/_shared.ts is GENERATED + gitignored.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// The runner build (NodeNext) compiles every file under src/, so copying a pure
// shared module here gives the .mjs unit tests a compiled JS artifact to import
// (runner/dist/_*.js) — the exact code the app imports directly via @/shared/*.
const files = [
  { src: 'shared/services.ts', dst: 'runner/src/_shared.ts' },
  { src: 'shared/market.ts', dst: 'runner/src/_market.ts' },
  { src: 'shared/agentPlanner.ts', dst: 'runner/src/_agentPlanner.ts' },
  { src: 'shared/mandate.ts', dst: 'runner/src/_mandate.ts' },
  { src: 'shared/ledgerErrors.ts', dst: 'runner/src/_ledgerErrors.ts' },
  // Phase 2 agent core (pure). Cross-imports to './agentCore' are rewritten to './_agentCore'
  // below so the generated runner tree resolves.
  { src: 'shared/agentCore.ts', dst: 'runner/src/_agentCore.ts' },
  { src: 'shared/taskPlanner.ts', dst: 'runner/src/_taskPlanner.ts' },
  { src: 'shared/providerDecision.ts', dst: 'runner/src/_providerDecision.ts' },
  { src: 'shared/agentReconcile.ts', dst: 'runner/src/_agentReconcile.ts' },
  { src: 'shared/agentRun.ts', dst: 'runner/src/_agentRun.ts' },
];
for (const { src, dst } of files) {
  let body = readFileSync(resolve(here, '..', src), 'utf8');
  // Preserve relative shared→shared imports across the generated `_`-prefixed tree.
  body = body.replace(/(['"])\.\/agentCore\1/g, "$1./_agentCore.js$1");
  writeFileSync(resolve(here, '..', dst), `// GENERATED from ${src} — DO NOT EDIT. Regenerate: node scripts/sync-shared.mjs\n${body}`);
  console.log(`synced ${src} -> ${dst}`);
}
