'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT } from '../../lens/components/theme';
import { Card, CopyId, Row, SectionTitle, StatChip } from './bits';
import { WorkResultView } from './WorkResult';
import { POLICY_META, type RunnerHealth, type StoredRun, type WorkHealth, type WorkPhase, type WorkResult } from '../types';

const STORE_KEY = 'tacit.work.lastRun';
const PROCURE_TIMEOUT_MS = 150_000;
const SERVICE = 'vendor_security_assessment';

const newJobId = () => `vjob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Ledger-derived lifecycle stages (advanced ONLY by /api/work/status; no timers).
const STAGES: { key: string; label: string }[] = [
  { key: 'request_opened', label: 'Private request opened on Canton' },
  { key: 'bids_received', label: 'Sealed provider bids received' },
  { key: 'award_settled', label: 'Awarded + prepaid atomically' },
  { key: 'assignment_created', label: 'Winner assigned the work' },
  { key: 'delivery_received', label: 'Private delivery received' },
  { key: 'receipt_created', label: 'Verified + receipt created' },
];

export function WorkExperience() {
  const reduce = useReducedMotion();
  const [health, setHealth] = useState<WorkHealth | null>(null);
  const [phase, setPhase] = useState<WorkPhase>('idle');
  const [url, setUrl] = useState('https://example.com');
  const [budget, setBudget] = useState(100);
  const [policyId, setPolicyId] = useState('standard-saas-v1');
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<WorkResult | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [restored, setRestored] = useState(false);
  const [stages, setStages] = useState<Record<string, boolean>>({});
  const [showMcp, setShowMcp] = useState(false);
  const runnersAtRun = useRef<RunnerHealth[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/work/health', { cache: 'no-store' });
      setHealth(await r.json());
    } catch {
      setHealth({ ok: false, schema: 2, mode: 'unknown', ledgerReachable: false, corePackage: { name: 'tacit', shortId: '' }, workPackage: { name: 'tacit-work', shortId: '' }, runners: [], distinctInstances: false, distinctProcesses: false, serviceQuorum: {}, launchService: SERVICE, launchReady: false, reason: 'work health unreachable' });
    }
  }, []);

  useEffect(() => { loadHealth(); if (phase !== 'idle') return; const t = setInterval(loadHealth, 6000); return () => clearInterval(t); }, [loadHealth, phase]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredRun;
      if (s?.result?.ok && s.result.schema === 2) {
        setResult(s.result); setJobId(s.jobId); setUrl(s.url); setBudget(s.maxBudget); setPolicyId(s.policyId || 'standard-saas-v1'); setRestored(true);
        setPhase(s.result.artifact.available ? 'success' : 'resumed');
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(t);
  }, [phase]);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const run = useCallback(async (reuseId?: string) => {
    const id = reuseId || newJobId();
    setJobId(id); setError(''); setUncertain(false); setRestored(false); setElapsed(0); setStages({}); setPhase('running');
    runnersAtRun.current = health?.runners || [];
    // Honest telemetry: poll the ledger-derived status (a stage is true only when its contract exists).
    stopPoll();
    pollRef.current = setInterval(async () => {
      try { const r = await fetch(`/api/work/status?jobId=${encodeURIComponent(id)}`, { cache: 'no-store' }); const j = await r.json(); if (j?.ok) setStages(j.stages || {}); } catch { /* ignore */ }
    }, 2000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROCURE_TIMEOUT_MS);
    try {
      const r = await fetch('/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: id, serviceType: SERVICE, input: { url }, maxBudget: budget, policyId, buyerName: 'Judge-Agent' }), signal: ctrl.signal });
      const data = await r.json();
      stopPoll();
      if (!r.ok || !data?.ok) { setError(String(data?.error || `request failed (HTTP ${r.status})`)); setPhase('error'); return; }
      const wr = data as WorkResult;
      setResult(wr);
      if (wr.artifact.available) {
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ jobId: id, url, maxBudget: budget, policyId, result: wr, savedAtUtc: new Date().toISOString() } as StoredRun)); } catch { /* ignore */ }
        setPhase('success');
      } else setPhase('resumed');
    } catch (e: any) {
      stopPoll();
      const aborted = e?.name === 'AbortError';
      setUncertain(aborted);
      setError(aborted ? 'The request timed out in the browser — the ledger job may still have completed.' : String(e?.message || e));
      setPhase('error');
    } finally { clearTimeout(timer); }
  }, [url, budget, policyId, health]);

  const startNew = useCallback(() => {
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    stopPoll(); setResult(null); setError(''); setUncertain(false); setRestored(false); setJobId(''); setStages({}); setPhase('idle'); loadHealth();
  }, [loadHealth]);

  useEffect(() => () => stopPoll(), []);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-24 sm:px-8">
      <div aria-live="polite" className="sr-only">
        {phase === 'running' && 'Your procurement agent is working on Canton.'}
        {phase === 'success' && `Assessment delivered. Decision: ${result?.policy?.decision || 'complete'}.`}
        {phase === 'error' && `Error: ${error}`}
        {phase === 'resumed' && 'Existing completed job recovered.'}
      </div>

      {phase === 'idle' && <IdleView health={health} url={url} setUrl={setUrl} budget={budget} setBudget={setBudget} policyId={policyId} setPolicyId={setPolicyId} onRun={() => run()} reduce={!!reduce} showMcp={showMcp} setShowMcp={setShowMcp} />}
      {phase === 'running' && <RunningView elapsed={elapsed} runners={runnersAtRun.current} url={url} stages={stages} reduce={!!reduce} />}
      {phase === 'success' && result && (
        <div>
          {restored && <RestoredBanner />}
          <WorkResultView result={result} runners={runnersAtRun.current.length ? runnersAtRun.current : health?.runners || []} />
          <div className="mt-8 flex justify-center"><NewButton onClick={startNew} label="New assessment" /></div>
        </div>
      )}
      {phase === 'resumed' && result && <ResumedView result={result} onNew={startNew} restored={restored} />}
      {phase === 'error' && <ErrorView error={error} uncertain={uncertain} jobId={jobId} url={url} budget={budget} onRetry={() => run(jobId)} onNew={startNew} />}
    </div>
  );
}

function IdleView({ health, url, setUrl, budget, setBudget, policyId, setPolicyId, onRun, reduce, showMcp, setShowMcp }: any) {
  const ready = !!health?.launchReady;
  const q = health?.serviceQuorum?.[SERVICE];
  const online = q?.supported ?? 0;
  const httpsOk = /^https:\/\//i.test(url.trim());
  const canRun = ready && httpsOk && budget > 0;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Private vendor assessment · Canton devnet</div>
      <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 'clamp(28px, 5.5vw, 44px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.06 }}>Let your procurement agent<br />hire the right security agent.</h1>
      <p className="mt-5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 16, lineHeight: 1.6, maxWidth: '56ch' }}>Three provider agents bid privately to assess a vendor’s public web-security posture. The winner performs the work, the findings stay private to you, and compliance receives a receipt — never the report.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <StatChip label={health ? (health.ledgerReachable ? 'Canton devnet' : 'Canton unreachable') : 'Checking…'} tone={health?.ledgerReachable ? 'live' : 'warn'} />
        <StatChip label={`${online}/3 capable agents`} tone={online >= 3 ? 'live' : 'warn'} />
        <StatChip label="vendor_security_assessment v1" tone={ready ? 'live' : 'neutral'} />
      </div>

      <Card style={{ marginTop: 24 }}>
        <label htmlFor="w-url" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Vendor / API / MCP endpoint</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input id="w-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vendor.example.com" aria-invalid={!httpsOk}
            className="flex-1 rounded-xl px-3.5 py-2.5" style={{ minWidth: 220, background: C.bg, border: `1px solid ${httpsOk ? C.hairline : 'rgba(180,83,9,0.5)'}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13.5, outlineColor: C.violet }} />
          <button type="button" onClick={() => setUrl('https://example.com')} className="rounded-lg px-2.5 py-1.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}`, color: C.violet, fontFamily: FONT.sans, fontSize: 12, cursor: 'pointer' }}>Use example</button>
        </div>
        {!httpsOk && <div className="mt-1.5" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12 }}>Enter an https:// URL.</div>}

        <div className="mt-4">
          <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Onboarding policy</span>
          <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Onboarding policy">
            {POLICY_META.map((p) => (
              <button key={p.id} role="radio" aria-checked={policyId === p.id} onClick={() => setPolicyId(p.id)} title={p.hint}
                className="rounded-full px-3.5 py-1.5" style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', color: policyId === p.id ? '#fff' : C.ink2, background: policyId === p.id ? C.ink : C.surface, border: `1px solid ${policyId === p.id ? C.ink : C.hairline}` }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="w-budget" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Maximum budget</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input id="w-budget" type="number" min={1} max={10000} value={budget} onChange={(e) => setBudget(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))} className="w-32 rounded-xl px-3.5 py-2.5" style={{ background: C.bg, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13.5, outlineColor: C.violet }} />
            <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>USD.demo — a demo voucher, not real money or a stablecoin.</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <motion.button type="button" onClick={onRun} disabled={!canRun} whileHover={reduce || !canRun ? undefined : { y: -1 }} whileTap={reduce || !canRun ? undefined : { scale: 0.99 }}
            className="rounded-full px-6 py-3" style={{ background: canRun ? C.ink : 'rgba(10,10,11,0.28)', color: '#fff', fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, cursor: canRun ? 'pointer' : 'not-allowed' }}>Assess this vendor →</motion.button>
          <button type="button" onClick={() => setShowMcp((v: boolean) => !v)} className="text-[14px] font-medium" style={{ color: C.ink2, fontFamily: FONT.sans }}>Use from an AI agent via MCP {showMcp ? '▲' : '▼'}</button>
        </div>
        {showMcp && (
          <div className="mt-3 rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
            <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>Any MCP agent can procure this. Point the Tacit MCP at this origin, then call:</div>
            <pre className="mt-1.5 overflow-x-auto" style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 11.5 }}>{`tacit_assess_vendor({\n  url: "${url}",\n  maxBudget: ${budget},\n  policyId: "${policyId}"\n})`}</pre>
          </div>
        )}
        {!ready && <div className="mt-3" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12.5 }}>{health ? `Not ready — ${health.reason}. Refreshing…` : 'Checking the provider network…'}</div>}
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>Devnet verified · no fallback</span>
        <Link href="/lens" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13 }}>Inspect ledger privacy →</Link>
      </div>
    </motion.div>
  );
}

function RunningView({ elapsed, runners, url, stages, reduce }: { elapsed: number; runners: RunnerHealth[]; url: string; stages: Record<string, boolean>; reduce: boolean }) {
  const firstPending = STAGES.findIndex((s) => !stages[s.key]);
  return (
    <div className="pt-4">
      <SectionTitle kicker="running on Canton">Your procurement agent is working</SectionTitle>
      <p style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: 1.6, maxWidth: '54ch' }}>Assessing <span style={{ fontFamily: FONT.mono, color: C.ink }}>{url}</span>. Three separate provider processes are bidding privately; the winner performs the assessment and delivers it through Canton. No fallback — nothing is fabricated while we wait.</p>
      <div className="mt-4 flex items-center gap-3"><span className="tacit-pulse inline-block h-2 w-2 rounded-full" style={{ background: C.violet }} /><span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 14 }}>{(elapsed / 1000).toFixed(1)}s elapsed</span></div>
      {runners.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{runners.map((r) => (<span key={r.instanceId} className="rounded-md px-2 py-1" style={{ background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 11, color: C.ink2 }}>{r.label} · {r.partyShort}</span>))}</div>}
      <Card style={{ marginTop: 20 }}>
        <ol className="flex flex-col gap-2.5">
          {STAGES.map((s, i) => {
            const done = !!stages[s.key];
            const current = !done && i === firstPending;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span aria-hidden className={current && !reduce ? 'tacit-pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: done ? C.live : current ? C.violet : 'rgba(10,10,11,0.16)' }} />
                <span style={{ color: done ? C.ink : C.ink2, fontFamily: FONT.sans, fontSize: 13.5, fontWeight: done ? 500 : 400 }}>{s.label}</span>
                {done && <span aria-hidden style={{ color: C.live, fontSize: 12 }}>✓</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>Each step is confirmed by a real contract on Canton — no step advances on a timer.</p>
      </Card>
    </div>
  );
}

function ErrorView({ error, uncertain, jobId, url, budget, onRetry, onNew }: any) {
  return (
    <div className="pt-6">
      <SectionTitle kicker={uncertain ? 'uncertain — safe to retry' : 'procurement failed'}>{uncertain ? 'The job may still have completed' : 'Assessment did not complete'}</SectionTitle>
      <Card>
        <p style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.55 }}>{error}</p>
        <div className="mt-3"><Row label="URL" mono>{url}</Row><Row label="Budget" mono>{budget} USD.demo</Row><Row label="Job id" mono>{jobId}</Row></div>
        <p className="mt-3" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.5 }}>{uncertain ? 'Retrying reuses the same job id and resumes the same Canton job — the ledger is idempotent, so it will not pay twice.' : 'This is the exact error from the workflow. There is no simulated fallback.'}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={onRetry} className="rounded-full px-5 py-2.5" style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Retry safely (same job)</button>
          <NewButton onClick={onNew} label="Start a new assessment" />
        </div>
      </Card>
    </div>
  );
}

function ResumedView({ result, onNew, restored }: { result: WorkResult; onNew: () => void; restored: boolean }) {
  const ev = result.evidence;
  return (
    <div className="pt-6">
      {restored && <RestoredBanner />}
      <SectionTitle kicker="idempotent replay">Existing completed job recovered</SectionTitle>
      <Card>
        <p style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.55 }}>This job was already awarded, delivered, and accepted on Canton. The settlement and receipt are real and shown below — but the accepted report and decision are not reconstructed by the active-contract reader, so they are not displayed here.</p>
        <div className="mt-3">
          <Row label="Winner">{result.winner.providerLabel}</Row>
          <Row label="Amount" mono>{result.amount.toFixed(2)} USD.demo · demo voucher</Row>
          <Row label="Committed SHA-256" mono>{result.artifact.providerCommittedSha256.slice(0, 24)}…</Row>
          <Row label="Settlement"><CopyId id={ev.settlementContractId} /></Row>
          <Row label="Delivery receipt"><CopyId id={ev.receiptContractId} /></Row>
        </div>
        <div className="mt-4"><NewButton onClick={onNew} label="Run a new assessment" dark /></div>
      </Card>
    </div>
  );
}

function NewButton({ onClick, label, dark }: { onClick: () => void; label: string; dark?: boolean }) {
  return <button type="button" onClick={onClick} className="rounded-full px-5 py-2.5" style={{ background: dark ? C.ink : C.surface, border: dark ? 'none' : `1px solid ${C.hairline}`, color: dark ? '#fff' : C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{label}</button>;
}

function RestoredBanner() {
  return <div className="mb-4 rounded-xl px-4 py-2.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}` }}><span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5 }}>Restored from this browser’s live response (session only — not ledger storage).</span></div>;
}
