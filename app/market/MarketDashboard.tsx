'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { C, FONT } from '../lens/components/theme';
import { Card, SectionTitle, StatChip } from '../work/components/bits';
import type { MarketOverview, MarketProvider, MarketReceiptRow } from '@/shared/market';

type MarketData = MarketOverview & { available: true; viewer: 'auditor'; asOfUtc: string };
type Fetched = { ok: true; data: MarketData } | { ok: false; reason: string };

const REFRESH_MS = 15_000;

const SERVICE_LABEL: Record<string, string> = {
  vendor_security_assessment: 'Vendor security',
  web_performance_probe: 'Web performance',
  site_audit: 'Site audit',
};
const svcLabel = (id: string | null) => (id ? SERVICE_LABEL[id] || id : '—');

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '—';
  const mm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${mm} ${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function MarketDashboard() {
  const [state, setState] = useState<Fetched | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/market/overview', { cache: 'no-store' });
      const j = await r.json();
      if (j?.available === true) setState({ ok: true, data: j as MarketData });
      else setState({ ok: false, reason: String(j?.reason || `HTTP ${r.status}`) });
    } catch (e: any) {
      setState({ ok: false, reason: String(e?.message || 'network error') });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load(); // initial load always fires, regardless of visibility
    const schedule = () => {
      timer.current = setTimeout(async () => {
        if (!alive) return;
        if (!document.hidden) await load(); // pause polling while the tab is hidden
        schedule();
      }, REFRESH_MS);
    };
    schedule();
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-28 sm:px-8">
      <Hero />
      {state === null && <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 14 }}>Reading the ledger…</div>}
      {state && state.ok === false && (
        <Card style={{ borderColor: 'rgba(180,83,9,0.3)' }}>
          <div style={{ color: C.fallback, fontFamily: FONT.sans, fontSize: 14 }}>
            The market view is unavailable right now — <span style={{ fontFamily: FONT.mono }}>{state.reason}</span>. Nothing is fabricated; this page only shows what the auditor can read live.
          </div>
        </Card>
      )}
      {state && state.ok === true && <Overview d={state.data} refreshing={refreshing} />}
      <CrossLinks />
    </div>
  );
}

function Hero() {
  return (
    <header className="mb-8">
      <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        Private work exchange · Canton devnet
      </div>
      <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 680, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
        The market, from the auditor’s chair.
      </h1>
      <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 'clamp(15px, 2vw, 17px)', lineHeight: 1.5, maxWidth: 640 }}>
        Everything below is computed live from contracts the auditor party can lawfully see — settlements and delivery
        receipts. Sealed bids and report bodies never appear here. The ledger won’t return them.
      </p>
    </header>
  );
}

function Overview({ d, refreshing }: { d: MarketData; refreshing: boolean }) {
  return (
    <>
      <StatRow d={d} refreshing={refreshing} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {d.providers.map((p) => <ProviderCard key={p.id} p={p} />)}
      </div>
      <div className="mt-8">
        <SectionTitle kicker="Auditor-visible · commitment only">Sealed delivery receipts</SectionTitle>
        <ReceiptFeed rows={d.receipts} />
      </div>
      {d.degradation.length > 0 && (
        <div className="mt-4" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12 }}>
          {d.degradation.map((x, i) => <div key={i}>· {x}</div>)}
        </div>
      )}
    </>
  );
}

function StatRow({ d, refreshing }: { d: MarketData; refreshing: boolean }) {
  const cells: { k: string; v: string }[] = [
    { k: 'Completed jobs', v: fmtNum(d.totals.completedJobs) },
    { k: 'Total volume', v: `${fmtNum(d.totals.totalVolume)} demo credits` },
    { k: 'Capable agents', v: `${d.meta.capableAgents.ready}/${d.meta.capableAgents.total}` },
    { k: 'Services live', v: fmtNum(d.meta.servicesLive) },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <Card key={c.k} style={{ padding: 16 }}>
            <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5, letterSpacing: '0.02em' }}>{c.k}</div>
            <div className="mt-1" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 22, fontWeight: 640, letterSpacing: '-0.01em' }}>{c.v}</div>
          </Card>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2" aria-live="polite">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: refreshing ? C.violet : C.live }} aria-hidden />
        <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>
          {refreshing ? 'refreshing…' : `live · as of ${fmtTime(d.asOfUtc)}`} · auto-refreshes every 15s
        </span>
      </div>
    </>
  );
}

function ProviderCard({ p }: { p: MarketProvider }) {
  const pct = Math.round(p.winShare * 100);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 15, fontWeight: 620 }}>{p.label}</div>
        <span className="inline-flex items-center gap-1.5" title={p.ready ? 'ready' : 'not currently advertising'}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.ready ? C.live : C.ink3 }} aria-hidden />
          <span style={{ color: p.ready ? C.live : C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>{p.ready ? 'ready' : 'idle'}</span>
        </span>
      </div>
      <div className="mt-1" style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>{p.partyShort}</div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>Treasury</div>
          <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 20, fontWeight: 640 }}>{fmtNum(p.earned)}</div>
          <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 10.5 }}>demo credits</div>
        </div>
        <div className="text-right">
          <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>Wins</div>
          <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 20, fontWeight: 640 }}>{p.wins}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 10.5 }}>
          <span>Win share</span><span>{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(10,10,11,0.06)' }} role="img" aria-label={`win share ${pct} percent`}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.violet, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.servicesAdvertised.length === 0
          ? <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>no live capability advertised</span>
          : p.servicesAdvertised.map((s) => (
            <span key={s} className="rounded-full px-2 py-0.5" style={{ background: C.violetSoft, color: C.ink2, fontFamily: FONT.sans, fontSize: 10.5, border: `1px solid ${C.hairline}` }}>{svcLabel(s)}</span>
          ))}
      </div>
    </Card>
  );
}

function ReceiptFeed({ rows }: { rows: MarketReceiptRow[] }) {
  if (rows.length === 0) {
    return <Card><div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 13 }}>No delivery receipts visible yet. When a job completes, its commitment appears here — the report body never does.</div></Card>;
  }
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
              {['Time', 'Receipt', 'SHA-256 commitment', 'Bytes', 'Winner', 'Amount', 'Service', 'Report body'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.receiptCidShort + i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(r.acceptedAtUtc)}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.mono, fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.receiptCidShort}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.sha256Short}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.mono, fontSize: 12 }}>{fmtNum(r.byteLen)}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{r.winnerLabel ?? '—'}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{r.amount == null ? '—' : `${fmtNum(r.amount)}`}</td>
                <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{svcLabel(r.serviceType)}</td>
                <td className="px-4 py-2.5" style={{ whiteSpace: 'nowrap' }}>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'rgba(10,10,11,0.04)', color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.04em' }}>
                    <span aria-hidden>🔒</span> sealed
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CrossLinks() {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3">
      <Link href="/work" className="rounded-full px-5 py-2.5 no-underline" style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans, fontSize: 14, fontWeight: 500 }}>
        Hire an agent →
      </Link>
      <Link href="/lens" className="rounded-full px-5 py-2.5 no-underline" style={{ background: C.surface, color: C.ink, border: `1px solid ${C.hairline}`, fontFamily: FONT.sans, fontSize: 14, fontWeight: 500 }}>
        Inspect ledger privacy →
      </Link>
    </div>
  );
}
