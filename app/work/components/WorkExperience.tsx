'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT } from '../../lens/components/theme';
import { Card, CopyId, Row, SectionTitle, Sealed, StatChip } from './bits';
import { WorkResultView } from './WorkResult';
import { POLICY_BY_SERVICE, POLICY_META, SERVICE_META, SERVICE_ORDER, type RunnerHealth, type StoredRun, type WorkHealth, type WorkPhase, type WorkResult } from '../types';

const STORE_KEY = 'tacit.work.lastRun';
const ONBOARD_KEY = 'tacit.work.onboarded';
const PROCURE_TIMEOUT_MS = 150_000;
const DEFAULT_SVC = 'vendor_security_assessment';

// Zero-typing example goals — span both services and both policy families. Tapping
// one fills the composer; the user reviews and submits. The LLM infers the service
// and policy from the plain-English wording.
const EXAMPLE_GOALS: { label: string; goal: string }[] = [
  { label: 'Onboard a vendor · strict infra', goal: "We're onboarding acme-corp.com as a vendor — strict about infrastructure, budget 60." },
  { label: 'Is it fast enough? · standard SLO', goal: 'Is example.com fast enough for launch? Standard SLO, budget 40.' },
  { label: 'Quick security pre-screen', goal: 'Quick security pre-screen of example.com before we integrate, budget 50.' },
];

// First-run three-step explainer, dismissible + remembered in localStorage.
function FirstRunStrip() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(localStorage.getItem(ONBOARD_KEY) !== '1'); } catch { setShow(true); } }, []);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ } setShow(false); };
  const steps = [
    { n: '1', t: 'The agent proposes', d: 'a mandate — service, target, policy, budget' },
    { n: '2', t: 'You approve it', d: 'nothing is spent until you do' },
    { n: '3', t: 'Real work runs on Canton', d: 'sealed bids, private delivery, verified' },
  ];
  return (
    <div className="material-clear mt-5 p-3.5" style={{ background: C.violetSoft, borderColor: 'rgba(124,58,237,0.2)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-4" style={{ flex: 1 }}>
          {steps.map((s) => (
            <div key={s.n} className="flex items-start gap-2">
              <span className="tacit-num inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: C.surface, border: `1px solid ${C.hairline}`, color: C.violet, fontSize: 11 }}>{s.n}</span>
              <div>
                <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600 }}>{s.t}</div>
                <div style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.4 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss the getting-started guide" className="shrink-0 rounded-md px-1.5" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
      </div>
    </div>
  );
}

// "What just happened" recap on the success view — closes the loop back to the economy.
function SuccessRecap() {
  const lines = [
    'Three provider agents bid in sealed secrecy; the ledger hid every price from the others.',
    'You awarded and paid the winner in one atomic Canton transaction; the report was delivered privately.',
    'You re-hashed the bytes and recomputed the score to verify it; an auditor got a receipt — never the report.',
  ];
  return (
    <div className="material-clear mt-8 p-5">
      <div className="tacit-label" style={{ marginBottom: 8 }}>What just happened</div>
      <ol className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="tacit-num" style={{ color: C.violet, fontSize: 12, marginTop: 1 }}>{i + 1}</span>
            <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.5 }}>{l}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link href="/market" className="no-underline" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 600 }}>Your job is now in the public feed — body sealed →</Link>
        <Link href="/lens" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13 }}>See it from each party →</Link>
      </div>
    </div>
  );
}

// Standing spend mandate (tacit-mandate) — FLAG-GATED. Fetches /api/mandate/status;
// on 404 (TACIT_MANDATE_MODE off) it renders NOTHING, so the idle view is bit-for-bit
// today's. When on, it shows the private budget envelope the human principal granted the
// agent: remaining of limit, scope, expiry. This is the buyer's OWN read — the auditor is
// never a stakeholder of a mandate, by design.
interface MandateStatusView {
  principal: string | null;
  mandate: { label: string; currency: string; limit: number; remaining: number; allowedServices: string[]; expiresAtUtc: string | null } | null;
}
function StandingMandatePanel() {
  const [s, setS] = useState<MandateStatusView | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/mandate/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok) setS({ principal: j.principal, mandate: j.mandate }); })
      .catch(() => { /* flag off / unreachable → render nothing */ });
    return () => { live = false; };
  }, []);
  if (!s) return null;
  const m = s.mandate;
  const scope = m && m.allowedServices.length ? m.allowedServices.map((x) => SERVICE_META[x]?.label ?? x).join(', ') : 'any registered service';
  const shortP = s.principal ? `${s.principal.slice(0, 10)}…` : 'your principal';
  return (
    <div className="material-clear mt-5 p-4" style={{ background: C.violetSoft, borderColor: 'rgba(124,58,237,0.2)' }}>
      <div className="flex items-center gap-2">
        <span className="tacit-label" style={{ color: C.violet }}>Standing spend mandate</span>
        <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>· enforced on-ledger</span>
      </div>
      {m ? (
        <>
          <div className="mt-1.5" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600 }}>
            {m.remaining} of {m.limit} {m.currency} remaining
          </div>
          <div className="mt-1" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.5 }}>
            Granted by {shortP} · scope: {scope}{m.expiresAtUtc ? ` · expires ${new Date(m.expiresAtUtc).toISOString().slice(0, 10)}` : ''}. Every award authorizes its spend against this envelope; the ledger refuses an over-budget award.
          </div>
        </>
      ) : (
        <div className="mt-1.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5 }}>No standing mandate is currently granted to this agent — a principal must grant one before it can spend.</div>
      )}
    </div>
  );
}

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
// Agent-voiced narration keyed DETERMINISTICALLY to real stage transitions (no LLM).
const NARRATION: Record<string, string> = {
  request_opened: 'I opened a private request on Canton and invited three provider agents.',
  bids_received: "3 sealed bids in. Each provider's price is hidden from the others by the ledger itself — I can see all three; they see only their own.",
  award_settled: 'I awarded the lowest eligible bid and prepaid it in one atomic transaction.',
  assignment_created: 'The winner is assigned the work; the losing providers learn nothing.',
  delivery_received: 'The assessment was delivered privately — visible to me and the winner only.',
  receipt_created: 'I recomputed the hash, schema, target and score, accepted, and a receipt was written for the auditor.',
};

type Mode = 'agent' | 'manual';
type AgentStep = 'compose' | 'planning' | 'mandate';
interface Proposal { serviceType: string; input: { url: string }; policyId: string; maxBudget: number; confidence: number | null; assumptions: string[] }

export function WorkExperience() {
  const reduce = useReducedMotion();
  const [health, setHealth] = useState<WorkHealth | null>(null);
  const [phase, setPhase] = useState<WorkPhase>('idle');
  const [mode, setMode] = useState<Mode>('agent');
  const [agentStep, setAgentStep] = useState<AgentStep>('compose');
  const [goalText, setGoalText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [planError, setPlanError] = useState('');
  const [url, setUrl] = useState('https://example.com');
  const [budget, setBudget] = useState(100);
  const [serviceType, setServiceType] = useState(DEFAULT_SVC);
  const [policyId, setPolicyId] = useState('standard-saas-v1');
  // Switch service → reset the policy to that service's first option.
  const chooseService = useCallback((s: string) => { setServiceType(s); setPolicyId(POLICY_BY_SERVICE[s]?.[0]?.id || ''); }, []);
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<WorkResult | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [restored, setRestored] = useState(false);
  const [stages, setStages] = useState<Record<string, boolean>>({});
  const runnersAtRun = useRef<RunnerHealth[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/work/health', { cache: 'no-store' });
      setHealth(await r.json());
    } catch {
      setHealth({ ok: false, schema: 2, mode: 'unknown', ledgerReachable: false, corePackage: { name: 'tacit', shortId: '' }, workPackage: { name: 'tacit-work', shortId: '' }, runners: [], distinctInstances: false, distinctProcesses: false, serviceQuorum: {}, launchService: DEFAULT_SVC, launchReady: false, reason: 'work health unreachable' });
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

  // Agent brief (LLM, OFF the work path): fetch after a fresh verified success only.
  useEffect(() => {
    if (phase !== 'success' || !result || !result.artifact.available || restored) return;
    let live = true;
    setBrief(null);
    (async () => {
      try {
        const r = await fetch('/api/agent/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workResult: result }) });
        const j = await r.json();
        if (live && j?.ok && typeof j.brief === 'string') setBrief(j.brief);
      } catch { /* on any failure, render nothing extra */ }
    })();
    return () => { live = false; };
  }, [phase, result, restored]);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const run = useCallback(async (reuseId: string | undefined, source: 'browser' | 'console') => {
    const id = reuseId || newJobId();
    setJobId(id); setError(''); setUncertain(false); setRestored(false); setElapsed(0); setStages({}); setBrief(null); setPhase('running');
    runnersAtRun.current = health?.runners || [];
    stopPoll();
    pollRef.current = setInterval(async () => {
      try { const r = await fetch(`/api/work/status?jobId=${encodeURIComponent(id)}`, { cache: 'no-store' }); const j = await r.json(); if (j?.ok) setStages(j.stages || {}); } catch { /* ignore */ }
    }, 2000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROCURE_TIMEOUT_MS);
    try {
      const r = await fetch('/api/work/procure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: id, serviceType, input: { url }, maxBudget: budget, policyId, requestSource: source, buyerName: 'Judge-Agent' }), signal: ctrl.signal });
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
  }, [url, budget, policyId, serviceType, health]);

  const plan = useCallback(async () => {
    if (goalText.trim().length < 4) return;
    setPlanError(''); setAgentStep('planning');
    try {
      const r = await fetch('/api/agent/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goalText }) });
      const j = await r.json();
      if (j?.ok && j.proposal) {
        setProposal(j.proposal);
        setUrl(j.proposal.input.url); setBudget(j.proposal.maxBudget); setServiceType(j.proposal.serviceType); setPolicyId(j.proposal.policyId);
        setAgentStep('mandate');
      } else {
        setPlanError(String(j?.reason || 'the planner could not produce a mandate')); setAgentStep('compose');
      }
    } catch {
      setPlanError('could not reach the planner — use the Manual tab'); setAgentStep('compose');
    }
  }, [goalText]);

  const startNew = useCallback(() => {
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    stopPoll(); setResult(null); setBrief(null); setError(''); setUncertain(false); setRestored(false); setJobId(''); setStages({}); setProposal(null); setAgentStep('compose'); setGoalText(''); setPhase('idle'); loadHealth();
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

      {phase === 'idle' && (
        <ConsoleIdle
          reduce={!!reduce} health={health} mode={mode} setMode={setMode}
          agentStep={agentStep} goalText={goalText} setGoalText={setGoalText} onPlan={plan} planError={planError}
          proposal={proposal}
          onApprove={() => run(undefined, 'console')}
          onEditManual={() => { if (proposal) { setUrl(proposal.input.url); setBudget(proposal.maxBudget); setServiceType(proposal.serviceType); setPolicyId(proposal.policyId); } setMode('manual'); setAgentStep('compose'); }}
          onRestartAgent={() => { setAgentStep('compose'); setProposal(null); }}
          url={url} setUrl={setUrl} budget={budget} setBudget={setBudget} serviceType={serviceType} chooseService={chooseService} policyId={policyId} setPolicyId={setPolicyId}
          onRunManual={() => run(undefined, 'browser')}
        />
      )}
      {phase === 'running' && <RunningView elapsed={elapsed} runners={runnersAtRun.current} url={url} stages={stages} reduce={!!reduce} serviceType={serviceType} />}
      {phase === 'success' && result && (
        <div>
          {restored && <RestoredBanner />}
          {brief && <AgentBrief brief={brief} />}
          <WorkResultView result={result} runners={runnersAtRun.current.length ? runnersAtRun.current : health?.runners || []} />
          <SuccessRecap />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <NewButton onClick={startNew} label="New assessment" />
          </div>
        </div>
      )}
      {phase === 'resumed' && result && <ResumedView result={result} onNew={startNew} restored={restored} />}
      {phase === 'error' && <ErrorView error={error} uncertain={uncertain} jobId={jobId} url={url} budget={budget} onRetry={() => run(jobId, 'console')} onNew={startNew} />}
    </div>
  );
}

// ── idle: Agent console (default) + Manual form ─────────────────────────────
function ConsoleIdle(p: any) {
  const { reduce, health, mode, setMode, serviceType } = p;
  const q = health?.serviceQuorum?.[serviceType];
  const ready = !!health?.ledgerReachable && (q?.quorum ?? false);
  const online = q?.supported ?? 0;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Buyer agent console · Canton devnet</div>
      <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.display, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.03 }}>Tell your procurement agent what you need.</h1>
      <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15.5, lineHeight: 1.6, maxWidth: '56ch' }}>Describe the work in plain English. The agent proposes a mandate you approve — then three provider agents bid privately, the winner performs the work, findings stay private, and a deterministic policy decides. The agent never invents findings or prices.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <StatChip label={health ? (health.ledgerReachable ? 'Canton devnet' : 'Canton unreachable') : 'Checking…'} tone={health?.ledgerReachable ? 'live' : 'warn'} />
        <StatChip label={`${online}/3 capable agents`} tone={online >= 3 ? 'live' : 'warn'} />
        <StatChip label={`${SERVICE_META[serviceType]?.label ?? serviceType}`} tone={ready ? 'live' : 'neutral'} />
      </div>

      <FirstRunStrip />
      <StandingMandatePanel />

      {/* tabs */}
      <div className="mt-6 inline-flex rounded-full p-1" role="tablist" aria-label="Console mode" style={{ background: 'rgba(10,10,11,0.04)', border: `1px solid ${C.hairline}` }}>
        {(['agent', 'manual'] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className="rounded-full px-4 py-1.5" style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: mode === m ? '#fff' : C.ink2, background: mode === m ? C.ink : 'transparent', border: 'none' }}>
            {m === 'agent' ? 'Agent' : 'Manual'}
          </button>
        ))}
      </div>

      {mode === 'agent' ? <AgentPane {...p} ready={ready} /> : <ManualPane {...p} ready={ready} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>Devnet verified · no fallback</span>
        <Link href="/lens" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13 }}>Inspect ledger privacy →</Link>
        <Link href="/market" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13 }}>Live market →</Link>
      </div>
      <ByoAgentFooter url={p.url} budget={p.budget} policyId={p.policyId} />
    </motion.div>
  );
}

function AgentPane({ agentStep, goalText, setGoalText, onPlan, planError, proposal, onApprove, onEditManual, onRestartAgent, ready }: any) {
  if (agentStep === 'mandate' && proposal) return <MandateCard proposal={proposal} onApprove={onApprove} onEditManual={onEditManual} onRestart={onRestartAgent} ready={ready} />;
  return (
    <Card style={{ marginTop: 16 }}>
      <label htmlFor="goal" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Your goal</label>
      <textarea id="goal" value={goalText} onChange={(e) => setGoalText(e.target.value)} rows={3} maxLength={2000}
        aria-describedby="goal-hint" disabled={agentStep === 'planning'}
        placeholder="We're onboarding acme.com as a vendor next week — vet them, budget 100, we're strict about infrastructure."
        className="mt-1.5 w-full resize-none rounded-xl px-3.5 py-2.5" style={{ background: C.bg, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: 1.5, outlineColor: C.violet }} />
      <div id="goal-hint" className="mt-1.5" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>The agent turns this into a mandate you approve. Nothing is spent until you approve.</div>
      {agentStep !== 'planning' && (
        <div className="mt-3">
          <div className="tacit-label" style={{ marginBottom: 6 }}>Or tap an example</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_GOALS.map((g) => (
              <button key={g.label} type="button" onClick={() => setGoalText(g.goal)}
                className="rounded-full px-3 py-1.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}`, color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, cursor: 'pointer' }}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>Any public HTTPS endpoint works — <span style={{ fontFamily: FONT.mono }}>example.com</span> is fine. Budget is in demo credits; the default is plenty.</div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onPlan} disabled={agentStep === 'planning' || goalText.trim().length < 4}
          className="rounded-full px-6 py-3" style={{ background: agentStep === 'planning' || goalText.trim().length < 4 ? 'rgba(10,10,11,0.28)' : C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, cursor: agentStep === 'planning' ? 'wait' : 'pointer' }}>
          {agentStep === 'planning' ? 'Planning…' : 'Plan the mandate →'}
        </button>
        {agentStep === 'planning' && <span aria-live="polite" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>Reading your goal and drafting a mandate — this can take up to a minute on a busy model.</span>}
        {agentStep !== 'planning' && !ready && <span style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12.5 }}>Provider network not ready — you can still plan, but approval waits for 3 agents.</span>}
      </div>
      {planError && <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'rgba(180,83,9,0.07)', border: '1px solid rgba(180,83,9,0.25)', color: C.ink, fontFamily: FONT.sans, fontSize: 12.5 }}>{planError}</div>}
    </Card>
  );
}

function MandateCard({ proposal, onApprove, onEditManual, onRestart, ready }: any) {
  const policyLabel = POLICY_META.find((x: any) => x.id === proposal.policyId)?.label ?? proposal.policyId;
  return (
    <Card style={{ marginTop: 16, borderColor: 'rgba(124,58,237,0.28)' }}>
      <div className="flex items-center justify-between">
        <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Proposed mandate · approve to proceed</div>
        <Sealed label="Unsigned" />
      </div>
      <div className="mt-1.5" style={{ color: C.ink, fontFamily: FONT.display, fontSize: 27, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.05 }}>Your agent proposes</div>
      <div className="mb-4 mt-3 h-px w-full" style={{ background: C.hairline }} aria-hidden />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        <Row label="Service">{SERVICE_META[proposal.serviceType]?.label ?? proposal.serviceType}</Row>
        <Row label="Target" mono>{proposal.input.url}</Row>
        <Row label="Policy">{policyLabel}</Row>
        <Row label="Max budget" mono>{proposal.maxBudget} <span style={{ color: C.ink3 }}>demo credits — devnet voucher</span></Row>
        {proposal.confidence != null && <Row label="Confidence" mono>{Math.round(proposal.confidence * 100)}%</Row>}
      </div>
      {proposal.assumptions?.length > 0 && (
        <div className="mt-3">
          <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Agent's assumptions</div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {proposal.assumptions.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5 }}><span aria-hidden style={{ color: C.violet }}>·</span>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onApprove} disabled={!ready}
          className="rounded-full px-6 py-3" style={{ background: ready ? C.ink : 'rgba(10,10,11,0.28)', color: '#fff', fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, cursor: ready ? 'pointer' : 'not-allowed' }}>Approve mandate →</button>
        <button type="button" onClick={onEditManual} className="text-[14px] font-medium" style={{ color: C.ink2, fontFamily: FONT.sans }}>Edit manually</button>
        <button type="button" onClick={onRestart} className="text-[13px]" style={{ color: C.ink3, fontFamily: FONT.sans }}>Start over</button>
      </div>
      {!ready && <div className="mt-2" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12 }}>Waiting for 3 live provider agents before you can approve.</div>}
    </Card>
  );
}

function ManualPane({ health, setMode, url, setUrl, budget, setBudget, serviceType, chooseService, policyId, setPolicyId, onRunManual, ready }: any) {
  const httpsOk = /^https:\/\//i.test(url.trim());
  const canRun = ready && httpsOk && budget > 0;
  const meta = SERVICE_META[serviceType] || SERVICE_META[DEFAULT_SVC];
  const policies = POLICY_BY_SERVICE[serviceType] || [];
  return (
    <Card style={{ marginTop: 16 }}>
      <div className="mb-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12 }}>
        Prefer plain English? The <button type="button" onClick={() => setMode('agent')} style={{ color: C.violet, fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Agent tab</button> writes this mandate for you.
      </div>
      <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>Service</span>
      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Service">
        {SERVICE_ORDER.map((sid: string) => {
          const avail = health?.serviceQuorum?.[sid]?.quorum ?? false;
          return (
            <button key={sid} role="radio" aria-checked={serviceType === sid} onClick={() => chooseService(sid)} title={SERVICE_META[sid]?.scope}
              className="rounded-full px-3.5 py-1.5" style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', color: serviceType === sid ? '#fff' : C.ink2, background: serviceType === sid ? C.ink : C.surface, border: `1px solid ${serviceType === sid ? C.ink : C.hairline}` }}>
              {SERVICE_META[sid]?.label ?? sid}{avail ? '' : ' · offline'}
            </button>
          );
        })}
      </div>

      <label htmlFor="w-url" className="mt-4 block" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>{meta.inputLabel}</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="w-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vendor.example.com" aria-invalid={!httpsOk}
          className="flex-1 rounded-xl px-3.5 py-2.5" style={{ minWidth: 220, background: C.bg, border: `1px solid ${httpsOk ? C.hairline : 'rgba(180,83,9,0.5)'}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13.5, outlineColor: C.violet }} />
        <button type="button" onClick={() => setUrl('https://example.com')} className="rounded-lg px-2.5 py-1.5" style={{ background: C.violetSoft, border: `1px solid ${C.hairline}`, color: C.violet, fontFamily: FONT.sans, fontSize: 12, cursor: 'pointer' }}>Use example</button>
      </div>
      {!httpsOk && <div className="mt-1.5" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12 }}>Enter an https:// URL.</div>}
      <div className="mt-4">
        <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600 }}>{meta.policyLabel}</span>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={meta.policyLabel}>
          {policies.map((pol: any) => (
            <button key={pol.id} role="radio" aria-checked={policyId === pol.id} onClick={() => setPolicyId(pol.id)} title={pol.hint}
              className="rounded-full px-3.5 py-1.5" style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', color: policyId === pol.id ? '#fff' : C.ink2, background: policyId === pol.id ? C.ink : C.surface, border: `1px solid ${policyId === pol.id ? C.ink : C.hairline}` }}>{pol.label}</button>
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
      <div className="mt-5">
        <motion.button type="button" onClick={onRunManual} disabled={!canRun} whileHover={canRun ? { y: -1 } : undefined} whileTap={canRun ? { scale: 0.99 } : undefined}
          className="rounded-full px-6 py-3" style={{ background: canRun ? C.ink : 'rgba(10,10,11,0.28)', color: '#fff', fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, cursor: canRun ? 'pointer' : 'not-allowed' }}>{meta.ctaLabel}</motion.button>
      </div>
      {!ready && <div className="mt-3" style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12.5 }}>{health ? `Not ready — ${health.reason}. Refreshing…` : 'Checking the provider network…'}</div>}
    </Card>
  );
}

function ByoAgentFooter({ url, budget, policyId }: { url: string; budget: number; policyId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium" style={{ color: C.ink2, fontFamily: FONT.sans }}>Bring your own agent (MCP) {open ? '▲' : '▼'}</button>
      {open && (
        <div className="mt-2 rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
          <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>The console and MCP are the same buyer path, two clients. Point the Tacit MCP at this origin and call:</div>
          <pre className="mt-1.5 overflow-x-auto" style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 11.5 }}>{`tacit_assess_vendor({\n  url: "${url}",\n  maxBudget: ${budget},\n  policyId: "${policyId}"\n})`}</pre>
        </div>
      )}
    </div>
  );
}

// ── running / success extras ────────────────────────────────────────────────
function RunningView({ elapsed, runners, url, stages, reduce, serviceType }: { elapsed: number; runners: RunnerHealth[]; url: string; stages: Record<string, boolean>; reduce: boolean; serviceType: string }) {
  const svcLine = SERVICE_META[serviceType]?.runningLine || 'The winner is performing the work and delivering it through Canton.';
  const firstPending = STAGES.findIndex((s) => !stages[s.key]);
  const lastDone = [...STAGES].reverse().find((s) => stages[s.key]);
  const narration = lastDone ? NARRATION[lastDone.key] : 'I opened a private request and I\'m waiting for the provider agents to bid.';
  return (
    <div className="pt-4">
      <SectionTitle kicker="running on Canton">Your procurement agent is working</SectionTitle>
      <p style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14.5, lineHeight: 1.6, maxWidth: '54ch' }}>Working on <span style={{ fontFamily: FONT.mono, color: C.ink }}>{url}</span>. Three separate provider processes are bidding privately; {svcLine} No fallback — nothing is fabricated while we wait.</p>
      <div aria-live="polite" className="mt-4 rounded-xl px-4 py-3" style={{ background: C.violetSoft, border: '1px solid rgba(124,58,237,0.2)' }}>
        <div className="flex items-center gap-2"><span aria-hidden style={{ color: C.violet }}>◆</span><span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Buyer agent</span></div>
        <div className="mt-1" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.5 }}>{narration}</div>
      </div>
      <div className="mt-3 flex items-center gap-3"><span className={reduce ? '' : 'tacit-pulse'} style={{ display: 'inline-block', height: 8, width: 8, borderRadius: 999, background: C.violet }} /><span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 14 }}>{(elapsed / 1000).toFixed(1)}s elapsed</span></div>
      {runners.length >= 3 && (
        <Card style={{ marginTop: 16 }}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="tacit-label">Sealed bids</span>
            <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>— each price is hidden from the other providers by the ledger, not the UI</span>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {runners.slice(0, 3).map((r) => (
              <div key={r.instanceId} className="material-frost flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.ink }}>{r.label}</span>
                <span className="flex-1 text-center" style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ink3 }}>{r.partyShort}</span>
                <Sealed label="Sealed bid" />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card style={{ marginTop: 16 }}>
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

function AgentBrief({ brief }: { brief: string }) {
  return (
    <Card style={{ marginBottom: 20, borderColor: 'rgba(124,58,237,0.28)' }}>
      <div className="flex items-center gap-2"><span aria-hidden style={{ color: C.violet }}>◆</span><span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent brief — generated; verified data below</span></div>
      <p className="mt-2" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 15, lineHeight: 1.6 }}>{brief}</p>
    </Card>
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
