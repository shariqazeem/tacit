'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT } from '../../lens/components/theme';
import { Card, CopyId, SectionTitle } from '../../work/components/bits';
import { SERVICE_META } from '../../work/types';

interface Authorization { contractId: string; jobId: string; amount: number; serviceType: string; authorizedAtUtc: string }
interface Mandate { contractId: string; label: string; currency: string; limit: number; remaining: number; spent: number; allowedServices: string[]; expiresAtUtc: string | null }
interface Workspace { ok: boolean; enabled: boolean; ledgerReachable: boolean; principal: string | null; agent: string | null; mandate: Mandate | null; history: Authorization[]; packageId: string }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const short = (p: string | null) => (p ? `${p.split('::')[0]}::${(p.split('::')[1] || '').slice(0, 8)}…` : '—');

export function WalletExperience() {
  const reduce = useReducedMotion();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [amount, setAmount] = useState('250');
  const [grantAmt, setGrantAmt] = useState('500');
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/wallet', { cache: 'no-store' });
      if (r.status === 404) { if (live.current) setFatal('Workspaces are not enabled on this deployment.'); return; }
      const j = await r.json();
      if (!live.current) return;
      if (j?.ok) setWs(j);
      else setFatal(j?.error || 'Could not load your workspace.');
    } catch (e: any) {
      if (live.current) setFatal(String(e?.message || e));
    } finally {
      if (live.current) setLoading(false);
    }
  }, []);

  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [load]);

  // Any principal write (topup/revoke/grant) → optimistic disable, honest per-outcome note.
  const act = useCallback(async (path: string, body: any, okMsg: string) => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) { setNote({ kind: 'ok', text: okMsg }); await load(); }
      else if (j?.reason === 'LEDGER_WRITE_THROTTLED') setNote({ kind: 'warn', text: j.error || 'Canton devnet is rate-limiting writes right now — nothing changed. Try again shortly.' });
      else setNote({ kind: 'err', text: j?.error || `Failed (HTTP ${r.status}).` });
    } catch (e: any) {
      setNote({ kind: 'err', text: String(e?.message || e) });
    } finally {
      if (live.current) setBusy(false);
    }
  }, [load]);

  if (loading) return <Shell><div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 14 }}>Loading your workspace…</div></Shell>;
  if (fatal) return <Shell><Card><div style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>{fatal}</div></Card></Shell>;

  const m = ws?.mandate || null;
  const pct = m && m.limit > 0 ? Math.max(0, Math.min(100, (m.remaining / m.limit) * 100)) : 0;
  const scope = m && m.allowedServices.length ? m.allowedServices.map((s) => SERVICE_META[s]?.label ?? s).join(', ') : 'any registered service';

  return (
    <Shell reduce={!!reduce}>
      <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Your workspace · Canton devnet</div>
      <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.display, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.04 }}>
        Your agent, on a budget you control.
      </h1>
      <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15.5, lineHeight: 1.6, maxWidth: '58ch' }}>
        You’re a party on Canton. You grant your AI procurement agent a private spending budget — a real
        contract on the ledger. It hires the market for you; the <em>ledger itself</em> refuses any spend
        beyond what you set. Fund it, cap it, or revoke it here.
      </p>

      {/* Identity */}
      <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <div className="tacit-label" style={{ marginBottom: 6 }}>Your Canton identity</div>
          <CopyId id={ws?.principal || ''} label={short(ws?.principal || null)} />
          <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>A real party on the devnet Global Synchronizer. It’s you — the principal.</div>
        </Card>
        <Card>
          <div className="tacit-label" style={{ marginBottom: 6 }}>Your procurement agent</div>
          <CopyId id={ws?.agent || ''} label={short(ws?.agent || null)} />
          <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>Acts only within the budget you grant — it can’t overspend you.</div>
        </Card>
      </div>

      {/* Budget hero OR grant-a-budget */}
      {m ? (
        <div className="material-clear mt-5 p-6" style={{ background: C.violetSoft, borderColor: 'rgba(124,58,237,0.2)' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="tacit-label" style={{ color: C.violet }}>Standing budget · enforced on-ledger</span>
            <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>{m.label}</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span style={{ color: C.ink, fontFamily: FONT.display, fontSize: 'clamp(44px, 8vw, 68px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(m.remaining)}</span>
            <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 16 }}>/ {fmt(m.limit)} {m.currency} remaining</span>
          </div>
          {/* progress */}
          <div className="mt-4" style={{ height: 8, borderRadius: 999, background: 'rgba(10,10,11,0.06)', overflow: 'hidden' }}>
            <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }} style={{ height: '100%', background: C.violet, borderRadius: 999 }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12 }}>
            <span>Spent <strong style={{ color: C.ink2 }}>{fmt(m.spent)}</strong></span>
            <span>Scope: {scope}</span>
            <span>{m.expiresAtUtc ? `Expires ${new Date(m.expiresAtUtc).toISOString().slice(0, 10)}` : 'No expiry'}</span>
          </div>

          {/* Top up — a REAL Canton transaction */}
          <div className="mt-5" style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 16 }}>
            <div className="tacit-label" style={{ marginBottom: 8 }}>Add budget</div>
            <div className="flex flex-wrap items-center gap-2">
              {[100, 250, 500].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} disabled={busy}
                  className="rounded-full px-3 py-1.5" style={{ background: C.surface, border: `1px solid ${amount === String(v) ? C.violet : C.hairline}`, color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>+{v}</button>
              ))}
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} aria-label="Top-up amount"
                className="rounded-xl px-3 py-2" style={{ width: 110, background: C.surface, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13, outlineColor: C.violet }} />
              <button type="button" disabled={busy || !(Number(amount) > 0)} onClick={() => act('/api/wallet/topup', { amount: Number(amount) }, `Added ${fmt(Number(amount))} ${m.currency} — confirmed on-ledger.`)}
                className="rounded-full px-5 py-2" style={{ background: busy || !(Number(amount) > 0) ? 'rgba(10,10,11,0.28)' : C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 500, cursor: busy ? 'wait' : 'pointer', border: 'none' }}>
                {busy ? 'Funding on Canton…' : 'Add budget →'}
              </button>
            </div>
            <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>This is a real <span style={{ fontFamily: FONT.mono }}>TopUp</span> transaction on the devnet ledger — it raises your remaining budget and your limit.</div>
          </div>

          {note && (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: note.kind === 'ok' ? 'rgba(13,148,136,0.08)' : note.kind === 'warn' ? 'rgba(180,83,9,0.08)' : 'rgba(176,42,42,0.07)', border: `1px solid ${note.kind === 'ok' ? 'rgba(13,148,136,0.28)' : note.kind === 'warn' ? 'rgba(180,83,9,0.28)' : 'rgba(176,42,42,0.25)'}`, color: C.ink, fontFamily: FONT.sans, fontSize: 12.5 }}>
              {note.kind === 'ok' ? '✓ ' : ''}{note.text}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link href="/work" className="no-underline" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 600 }}>Send your agent to work →</Link>
            <button type="button" disabled={busy} onClick={() => { if (confirm('Revoke your agent’s budget? It will lose all spending authority until you grant a new one.')) act('/api/wallet/revoke', {}, 'Budget revoked — your agent can no longer spend.'); }}
              style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 12.5, background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 0 }}>Revoke agent’s budget</button>
          </div>
        </div>
      ) : (
        <div className="material-clear mt-5 p-6">
          <SectionTitle kicker="no active budget">Grant your agent a budget to begin</SectionTitle>
          <p style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.6, maxWidth: '54ch' }}>Set the ceiling your agent may spend. It’s a real <span style={{ fontFamily: FONT.mono }}>SpendMandate</span> contract on Canton — the agent can never exceed it, and you can top up or revoke anytime.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input type="number" min={1} value={grantAmt} onChange={(e) => setGrantAmt(e.target.value)} disabled={busy} aria-label="Budget limit"
              className="rounded-xl px-3 py-2" style={{ width: 130, background: C.bg, border: `1px solid ${C.hairline}`, color: C.ink, fontFamily: FONT.mono, fontSize: 13, outlineColor: C.violet }} />
            <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>USD.demo</span>
            <button type="button" disabled={busy || !(Number(grantAmt) > 0)} onClick={() => act('/api/wallet/grant', { limit: Number(grantAmt) }, `Granted ${fmt(Number(grantAmt))} USD.demo — your agent is funded on-ledger.`)}
              className="rounded-full px-5 py-2" style={{ background: busy || !(Number(grantAmt) > 0) ? 'rgba(10,10,11,0.28)' : C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 500, cursor: busy ? 'wait' : 'pointer', border: 'none' }}>
              {busy ? 'Granting on Canton…' : 'Grant budget →'}
            </button>
          </div>
          {note && <div className="mt-3" style={{ color: note.kind === 'ok' ? C.live : note.kind === 'warn' ? C.fallback : '#B02A2A', fontFamily: FONT.sans, fontSize: 12.5 }}>{note.text}</div>}
        </div>
      )}

      {/* Real Canton Coin — the network's native asset, live on devnet (renders only if wired) */}
      <CoinPanel />

      {/* Spend history — the agent's on-ledger spends the user authorized */}
      <div className="mt-8">
        <SectionTitle kicker="on-ledger · private to you and your agent">Your agent’s spending</SectionTitle>
        {ws && ws.history.length > 0 ? (
          <Card>
            <div className="flex flex-col">
              {ws.history.slice(0, 12).map((a, i) => (
                <div key={a.contractId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5" style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.hairline}` }}>
                  <div className="flex items-baseline gap-3">
                    <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 500 }}>{SERVICE_META[a.serviceType]?.label ?? a.serviceType}</span>
                    <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>{a.jobId.slice(0, 22)}</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>{a.authorizedAtUtc ? a.authorizedAtUtc.replace('T', ' ').slice(0, 16) + ' UTC' : ''}</span>
                    <span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>−{fmt(a.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>Each line is a <span style={{ fontFamily: FONT.mono }}>SpendAuthorization</span> your agent recorded on-ledger before an award. The auditor never sees these — a mandate is confidential to you and your agent.</div>
          </Card>
        ) : (
          <Card>
            <div style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>No spends yet. <Link href="/work" className="no-underline" style={{ color: C.violet, fontWeight: 600 }}>Send your agent to work →</Link></div>
          </Card>
        )}
      </div>
    </Shell>
  );
}

// Real Canton Coin (Splice Amulet) on devnet — balance + a devnet faucet tap. Fetches
// /api/coin; renders NOTHING on 404 (wallet API not wired), so it's purely additive.
function CoinPanel() {
  const [c, setC] = useState<{ unlocked: number; locked: number; round: number | null; partyId: string | null; onboarded: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { const r = await fetch('/api/coin', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); if (j?.ok && j.ledgerReachable) setC(j); } catch { /* not wired */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!c) return null;
  const tap = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch('/api/coin/tap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 10 }) });
      const j = await r.json();
      if (r.ok && j?.ok) { setNote({ ok: true, text: `Minted 10 CC from the devnet faucet — real Amulet ${String(j.contractId).slice(0, 14)}…` }); await load(); }
      else setNote({ ok: false, text: j?.error || `Tap failed (HTTP ${r.status}).` });
    } catch (e: any) { setNote({ ok: false, text: String(e?.message || e) }); } finally { setBusy(false); }
  };
  return (
    <div className="material-clear mt-5 p-6" style={{ borderColor: 'rgba(13,148,136,0.22)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="tacit-label" style={{ color: C.live }}>Real Canton Coin · devnet · Splice Amulet</span>
        {c.round != null && <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>round {c.round}</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span style={{ color: C.ink, fontFamily: FONT.display, fontSize: 'clamp(34px, 6vw, 50px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.unlocked)}</span>
        <span style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15 }}>CC available</span>
      </div>
      <p className="mt-3" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13, lineHeight: 1.55, maxWidth: '58ch' }}>
        The network’s native asset, held in this validator’s onboarded wallet on the devnet Global Synchronizer.
        The <span style={{ fontFamily: FONT.mono }}>tap</span> below mints real Canton Coin from the devnet faucet.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={tap}
          className="rounded-full px-5 py-2" style={{ background: busy ? 'rgba(10,10,11,0.28)' : C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 500, cursor: busy ? 'wait' : 'pointer', border: 'none' }}>
          {busy ? 'Tapping the faucet…' : 'Tap 10 devnet CC →'}
        </button>
        {c.partyId && <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>{c.partyId.split('::')[0]}::{(c.partyId.split('::')[1] || '').slice(0, 8)}…</span>}
      </div>
      {note && <div className="mt-3" style={{ color: note.ok ? C.live : '#B02A2A', fontFamily: FONT.sans, fontSize: 12.5 }}>{note.ok ? '✓ ' : ''}{note.text}</div>}
      <p className="mt-3" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5 }}>
        Honest scope: job settlement still moves a <span style={{ fontFamily: FONT.mono }}>USD.demo</span> voucher. This proves the real Canton Coin rail is wired on devnet; per-user CC custody and CC-denominated settlement are the roadmap.
      </p>
    </div>
  );
}

function Shell({ children, reduce }: { children: React.ReactNode; reduce?: boolean }) {
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="mx-auto w-full max-w-3xl px-5 pb-24 pt-24 sm:px-8">
      {children}
    </motion.div>
  );
}
