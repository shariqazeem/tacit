// Durable local state so a restarted runner never re-bids or re-delivers a job.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export interface RunnerState {
  bids: Record<string, string>; // jobId -> bid contract id
  deliveries: Record<string, string>; // jobId -> delivery contract id
}

export function loadState(file: string): RunnerState {
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      return { bids: j.bids ?? {}, deliveries: j.deliveries ?? {} };
    }
  } catch {
    /* corrupt/missing → fresh */
  }
  return { bids: {}, deliveries: {} };
}

export function saveState(file: string, s: RunnerState): void {
  try {
    writeFileSync(file, JSON.stringify(s), 'utf8');
  } catch {
    /* best-effort */
  }
}
