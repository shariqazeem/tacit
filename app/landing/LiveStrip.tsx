'use client';

import { useEffect, useState } from 'react';
import { C, FONT } from '../lens/components/theme';

// Live proof directly under the hero: real figures from the auditor-view market
// endpoint at render time. NO hardcoded numbers — if the endpoint is unreachable
// the strip hides gracefully rather than fabricate anything.
type Overview = {
  available: true;
  asOfUtc: string;
  currency: string;
  totals: { completedJobs: number; totalVolume: number };
  meta: { capableAgents: { ready: number; total: number }; servicesLive: number };
};

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const mm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${mm} ${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function LiveStrip() {
  const [d, setD] = useState<Overview | null>(null);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/market/overview', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j?.available === true) { setD(j); setDead(false); } else setDead(true);
      } catch {
        if (alive) setDead(true);
      }
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Graceful hide: nothing rendered until real data arrives; nothing if it never does.
  if (dead || !d) return null;

  const ready = d.meta.capableAgents.ready;
  const Dot = () => <span aria-hidden style={{ color: C.ink3, opacity: 0.5 }}>·</span>;

  // Restrained inline proof — real ledger figures, no card clutter.
  return (
    <div className="mx-auto w-full max-w-5xl px-6 sm:px-8" role="group" aria-label="Live Canton Devnet proof" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2" style={{ fontFamily: FONT.sans, fontSize: 13 }}>
        <span className="inline-flex items-center gap-1.5" style={{ color: C.live, fontFamily: FONT.mono, fontSize: 11.5, fontWeight: 600 }}>
          <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
          Canton Devnet live
        </span>
        <Dot />
        <span style={{ color: C.ink2 }}><strong style={{ color: C.ink, fontFamily: FONT.mono }}>{ready}</strong> specialist agents online</span>
        <Dot />
        <span style={{ color: C.ink2 }}><strong style={{ color: C.ink, fontFamily: FONT.mono }}>{fmt(d.totals.completedJobs)}</strong> completed jobs</span>
        <Dot />
        <span style={{ color: C.ink2 }}>Daml-enforced budgets</span>
      </div>
      <div className="mt-2" style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5 }}>live from the auditor’s ledger view · {fmtTime(d.asOfUtc)}</div>
    </div>
  );
}
