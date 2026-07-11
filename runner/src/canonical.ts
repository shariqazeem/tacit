// Canonical JSON + SHA-256. The provider serializes the report with recursively
// sorted object keys and commits SHA-256 over the exact UTF-8 bytes it stores on
// the ledger. The buyer independently re-hashes the exact bytes it receives.
import { createHash } from 'node:crypto';

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

/** Deterministic JSON string with recursively sorted keys. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface Canonical {
  json: string;
  sha256: string;
  byteLen: number;
}

/** Canonical UTF-8 bytes + their SHA-256 + length. */
export function canonicalBytes(value: unknown): Canonical {
  const json = canonicalize(value);
  const bytes = Buffer.from(json, 'utf8');
  return { json, sha256: sha256Hex(bytes), byteLen: bytes.length };
}
