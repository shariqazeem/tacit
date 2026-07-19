// Tacit Phase 2 — durable append-only journal for a buyer agent run. File-backed (fs, zero new
// deps). The LEDGER stays the source of economic truth; this journal only stores resumable
// orchestration state + structured decision events, so a long-running / crashed buyer resumes
// exactly. Dir: TACIT_AGENT_JOURNAL_DIR (default .agent-journal/, gitignored).
import { promises as fs } from 'fs';
import path from 'path';
import type { AgentDecisionEvent } from '@/shared/agentCore';
import type { RunState } from '@/shared/agentRun';

const DIR = process.env.TACIT_AGENT_JOURNAL_DIR || path.join(process.cwd(), '.agent-journal');
const safe = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
const eventsPath = (id: string) => path.join(DIR, `${safe(id)}.events.jsonl`);
const statePath = (id: string) => path.join(DIR, `${safe(id)}.state.json`);

async function ensureDir() { await fs.mkdir(DIR, { recursive: true }); }

/** Append one structured decision event (never chain-of-thought). Append-only = tamper-evident-ish. */
export async function appendEvent(runId: string, ev: AgentDecisionEvent): Promise<void> {
  await ensureDir();
  await fs.appendFile(eventsPath(runId), JSON.stringify(ev) + '\n', 'utf8');
}

export async function readEvents(runId: string): Promise<AgentDecisionEvent[]> {
  try {
    const t = await fs.readFile(eventsPath(runId), 'utf8');
    return t.split('\n').filter(Boolean).map((l) => JSON.parse(l) as AgentDecisionEvent);
  } catch { return []; }
}

/** Persist the orchestration state (idempotently overwritten). Ledger remains authoritative. */
export async function writeState(runId: string, s: RunState): Promise<void> {
  await ensureDir();
  await fs.writeFile(statePath(runId), JSON.stringify(s), 'utf8');
}

export async function readState(runId: string): Promise<RunState | null> {
  try { return JSON.parse(await fs.readFile(statePath(runId), 'utf8')) as RunState; } catch { return null; }
}
