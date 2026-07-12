'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT } from '../../lens/components/theme';
import { Card, CopyId, Row, SectionTitle, StatChip } from './bits';
import { WorkResultView } from './WorkResult';
import type { RunnerHealth, StoredRun, WorkHealth, WorkPhase, WorkResult } from '../types';

const STORE_KEY = 'tacit.work.lastRun';
const PROCURE_TIMEOUT_MS = 150_000;

function newJobId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `wjob-${Date.now().toString(36)}-${rand}`;
}

const LIFECYCLE = [
  'Opening the private request',
  'Waiting for sealed provider bids',
  'Awaiting award and prepayment',
  'Awaiting private delivery',
  'Verifying the delivered bytes',
  'Awaiting the receipt',
];

export function WorkExperience() {
  const reduce = useReducedMotion();
  const [health, setHealth] = useState<WorkHealth | null>(null);
  const [phase, setPhase] = useState<WorkPhase>('idle');
  const [url, setUrl] = useState('https://example.com');
  const [budget, setBudget] = useState(100);
  const [jobId, setJobId] = useState<string>('');
  const [result, setResult] = useState<WorkResult | null>(null);
  const [error, setError] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [restored, setRestored] = useState(false);
  const runnersAtRun = useRef<RunnerHealth[]>([]);

  // ── health polling (idle only) ────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/work/health', { cache: 'no-store' });
      setHealth(await r.json());
    } catch {
      setHealth({ ok: false, schema: 2, mode: 'unknown', ledgerReachable: false, corePackage: { name: 'tacit', shortId: '' }, workPackage: { name: 'tacit-work', shortId: '' }, runners: [], distinctInstances: false, distinctProcesses: false, reason: 'work health unreachable' });
    }
  }, []);

  useEffect(() => {
    loadHealth();
    if (phase !== 'idle') return;
    const t = setInterval(loadHealth, 6000);
    return () => clearInterval(t);
  }, [loadHealth, phase]);

  // ── restore a fresh response from this browser session ────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredRun;
      if (s?.result?.ok && s.result.schema === 2) {
        setResult(s.result);
        setJobId(s.jobId);
        setUrl(s.url);
        setBudget(s.maxBudget);
        setRestored(true);
        setPhase(s.result.artifact.available ? 'success' : 'resumed');
      }
    } catch { /* ignore */ }
  }, []);

  // ── elapsed timer while running ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return;
    const start = Date.now() - elapsed;
    const t = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const run = useCallback(async (reuseId?: string) => {
    const id = reuseId || newJobId();
    setJobId(id);
    setError('');
    setUncertain(false);
    setRestored(false);
    setElapsed(0);
    setPhase('running');
    runnersAtRun.current = health?.runners || [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROCURE_TIMEOUT_MS);
    try {
      const r = await fetch('/api/work/procure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: id, serviceType: 'site_audit', input: { url }, maxBudget: budget, buyerName: 'Judge-Agent' }),
        signal: ctrl.signal,
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setError(String(data?.error || `request failed (HTTP ${r.status})`));
        setPhase('error');
        return;
      }
      const wr = data as WorkResult;
      setResult(wr);
      if (wr.artifact.available) {
        try {
          const stored: StoredRun = { jobId: id, url, maxBudget: budget, result: wr, savedAtUtc: new Date().toISOString() };
          sessionStorage.setItem(STORE_KEY, JSON.stringify(stored));
        } catch { /* quota / disabled */ }
        setPhase('success');
      } else {
        setPhase('resumed');
      }
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      setUncertain(aborted);
      setError(aborted ? 'The request timed out in the browser — the ledger job may still have completed.' : String(e?.message || e));
      setPhase('error');
    } finally {
      clearTimeout(timer);
    }
  }, [url, budget, health]);

  const startNew = useCallback(() => {
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    setResult(null);
    setError('');
    setUncertain(false);
    setRestored(false);
    setJobId('');
    setPhase('idle');
    loadHealth();
  }, [loadHealth]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-24 sm:px-8">
      <div aria-live="polite" className="sr-only">
        {phase === 'running' && 'Running the private procurement on Canton.'}
        {phase === 'success' && 'Audit delivered and verified.'}
        {phase === 'error' && `Error: ${error}`}
        {phase === 'resumed' && 'Existing completed job recovered.'}
      </div>

      {phase === 'idle' && <IdleView health={health} url={url} setUrl={setUrl} budget={budget} setBudget={setBudget} onRun={() => run()} reduce={!!reduce} />}
      {phase === 'running' && <RunningView elapsed={elapsed} runners={runnersAtRun.current} url={url} reduce={!!reduce} />}
      {phase === 'success' && result && (
        <div>
          {restored && <RestoredBanner />}
          <WorkResultView result={result} runners={runnersAtRun.current.length ? runnersAtRun.current : health?.runners || []} />
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={startNew} className="rounded-full px-5 py-2.5" style={{ background: C.surface, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>New audit</button>
          </div>
        </div>
      )}
      {phase === 'resumed' && result && <ResumedView result={result} onNew={startNew} restored={restored} />}
      {phase === 'error' && <ErrorView error={error} uncertain={uncertain} jobId={jobId} url={url} budget={budget} onRetry={() => run(jobId)} onNew={startNew} />}
    </div>
  );
}

// ── idle ──────────────────────────────────────────────────────────────────────
function IdleView({ health, url, setUrl, budget, setBudget, onRun, reduce }: {
  health: WorkHealth | null; url: string; setUrl: (v: string) => void; budget: number; setBudget: (v: number) => void; onRun: () => void; reduce: boolean;
}) {
  const ready = !!health?.ok;
  const runnersOnline = health?.runners?.length ?? 0;
  const httpsOk = /^https:\/\//i.test(url.trim());
  const canRun = ready && httpsOk && budget > 0;

  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        Real provider network · Canton devnet
      </div>
      <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
        Give agents a job.<br />Keep the market private.
      </h1>
      <p className="mt-5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 16, lineHeight: 1.6, maxWidth: '54ch' }}>
        Three live provider processes compete without seeing one another’s price. The winner performs the work,
        delivers it privately through Canton, and leaves an auditor-verifiable receipt.
      </p>

      {/* readiness */}
      <div className="mt-6 flex flex-wrap gap-2">
        <StatChip label={health ? (health.ledgerReachable ? 'Canton devnet ready' : 'Canton unreachable') : 'Checking Canton…'} tone={health?.ledgerReachable ? 'live' : 'warn'} />
        <StatChip label={`${runnersOnline}/3 providers online`} tone={runnersOnline >= 3 ? 'live' : 'warn'} />
        <StatChip label="Private delivery enabled" tone={ready ? 'live' : 'neutral'} />
      </div>

      {/* form */}
      <Card style={{ marginTop: 24 }}>
        <label htmlFor="work-url" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Website URL</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id="work-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com" aria-invalid={!httpsOk}
            className="flex-1 rounded-xl px-3.5 py-2.5"
            style={{ minWidth: 220, background: C.bg, border: `1px solid ${httpsOk ? C.hairline : 'rgba(180,83,9,0.5)'}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13.5, outlineColor: C.violet }}
          />
          <button type="button" onClick={() => setUrl('https://example.com')} className="rounded-lg px-2.5 py-1.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}`, color: C.violet, fontFamily: FONT.sans, fontSize: 12, cursor: 'pointer' }}>
            Use example
          </button>
        </div>
        {!httpsOk && <div className="mt-1.5" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12 }}>Enter an https:// URL.</div>}

        <div className="mt-4">
          <label htmlFor="work-budget" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Maximum budget</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="work-budget" type="number" min={1} max={10000} value={budget}
              onChange={(e) => setBudget(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))}
              className="w-32 rounded-xl px-3.5 py-2.5"
              style={{ background: C.bg, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13.5, outlineColor: C.violet }}
            />
            <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>USD.demo — a demo voucher, not real money or a stablecoin.</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <motion.button
            type="button" onClick={onRun} disabled={!canRun}
            whileHover={reduce || !canRun ? undefined : { y: -1 }} whileTap={reduce || !canRun ? undefined : { scale: 0.99 }}
            className="rounded-full px-6 py-3 no-underline"
            style={{ background: canRun ? C.ink : 'rgba(10,10,11,0.28)', color: '#fff', fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, cursor: canRun ? 'pointer' : 'not-allowed' }}
          >
            Run private audit →
          </motion.button>
          <Link href="/lens" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500 }}>
            Inspect the privacy model →
          </Link>
        </div>
        {!ready && (
          <div className="mt-3" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12.5 }}>
            {health ? `Procurement unavailable — ${health.reason}. Refreshing…` : 'Checking the provider network…'}
          </div>
        )}
      </Card>

      <div className="mt-6" style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.02em' }}>
        3 live runners · 2 Daml packages · 28/28 work invariants
      </div>
    </motion.div>
  );
}

// ── running ─────────────────────────────────────────────────────────────────
function RunningView({ elapsed, runners, url, reduce }: { elapsed: number; runners: RunnerHealth[]; url: string; reduce: boolean }) {
  const secs = (elapsed / 1000).toFixed(1);
  return (
    <div className="pt-4">
      <SectionTitle kicker="running on Canton">The real workflow is running</SectionTitle>
      <p style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: 1.6, maxWidth: '52ch' }}>
        Auditing <span style={{ fontFamily: FONT.mono, color: C.ink }}>{url}</span>. Three separate provider processes
        are bidding privately; the winner performs the work and delivers it through Canton. This can take a moment —
        nothing is fabricated while we wait.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="tacit-pulse inline-block h-2 w-2 rounded-full" style={{ background: C.violet }} />
        <span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 14 }}>{secs}s elapsed</span>
      </div>

      {runners.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {runners.map((r) => (
            <span key={r.instanceId} className="rounded-md px-2 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: C.ink2 }}>
              {r.label} · {r.partyShort}
            </span>
          ))}
        </div>
      )}

      <Card style={{ marginTop: 20 }}>
        <ol className="flex flex-col gap-2.5">
          {LIFECYCLE.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span aria-hidden className={reduce ? '' : 'tacit-pulse'} style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(10,10,11,0.18)', animationDelay: `${i * 0.15}s` }} />
              <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13.5 }}>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>
          Steps stay neutral until the ledger returns real evidence — no fake progress, prices, or contract ids.
        </p>
      </Card>
    </div>
  );
}

// ── error ───────────────────────────────────────────────────────────────────
function ErrorView({ error, uncertain, jobId, url, budget, onRetry, onNew }: {
  error: string; uncertain: boolean; jobId: string; url: string; budget: number; onRetry: () => void; onNew: () => void;
}) {
  return (
    <div className="pt-6">
      <SectionTitle kicker={uncertain ? 'uncertain — safe to retry' : 'procurement failed'}>
        {uncertain ? 'The job may still have completed' : 'Procurement did not complete'}
      </SectionTitle>
      <Card>
        <p style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.55 }}>{error}</p>
        <div className="mt-3">
          <Row label="URL" mono>{url}</Row>
          <Row label="Budget" mono>{budget} USD.demo</Row>
          <Row label="Job id" mono>{jobId}</Row>
        </div>
        <p className="mt-3" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.5 }}>
          {uncertain
            ? 'Retrying reuses the same job id and resumes the same Canton job — the ledger is idempotent, so it will not pay twice.'
            : 'This is the exact error from the workflow. There is no simulated fallback.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={onRetry} className="rounded-full px-5 py-2.5" style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Retry safely (same job)</button>
          <button type="button" onClick={onNew} className="rounded-full px-5 py-2.5" style={{ background: C.surface, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Start a new audit</button>
        </div>
      </Card>
    </div>
  );
}

// ── resumed (receipt without report body) ─────────────────────────────────────
function ResumedView({ result, onNew, restored }: { result: WorkResult; onNew: () => void; restored: boolean }) {
  const ev = result.evidence;
  return (
    <div className="pt-6">
      {restored && <RestoredBanner />}
      <SectionTitle kicker="idempotent replay">Existing completed job recovered</SectionTitle>
      <Card>
        <p style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.55 }}>
          This job was already awarded, delivered, and accepted on Canton. The settlement and receipt are real and shown
          below — but the accepted report body is not reconstructed by the active-contract reader, so it is not displayed here.
        </p>
        <div className="mt-3">
          <Row label="Winner">{result.winner.providerLabel}</Row>
          <Row label="Amount" mono>{result.amount.toFixed(2)} USD.demo · demo voucher</Row>
          <Row label="Committed SHA-256" mono>{result.artifact.sha256.slice(0, 24)}…</Row>
          <Row label="Byte length" mono>{result.artifact.byteLength}</Row>
          <Row label="Settlement"><CopyId id={ev.settlementContractId} /></Row>
          <Row label="Delivery receipt"><CopyId id={ev.receiptContractId} /></Row>
        </div>
        <div className="mt-4">
          <button type="button" onClick={onNew} className="rounded-full px-5 py-2.5" style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Run a new audit</button>
        </div>
      </Card>
    </div>
  );
}

function RestoredBanner() {
  return (
    <div className="mb-4 rounded-xl px-4 py-2.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}` }}>
      <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5 }}>
        Restored from this browser’s live response (session only — not ledger storage).
      </span>
    </div>
  );
}
