// Copies the authoritative shared service contract into the runner's src tree so
// the standalone runner build (NodeNext) can compile it. The app imports the same
// file directly via @/shared/services. runner/src/_shared.ts is GENERATED + gitignored.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../shared/services.ts');
const dst = resolve(here, '../runner/src/_shared.ts');
const body = readFileSync(src, 'utf8');
writeFileSync(dst, `// GENERATED from shared/services.ts — DO NOT EDIT. Regenerate: node scripts/sync-shared.mjs\n${body}`);
console.log('synced shared/services.ts -> runner/src/_shared.ts');
