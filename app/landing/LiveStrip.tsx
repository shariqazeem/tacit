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

  const cells = [
    { k: 'Completed jobs', v: fmt(d.totals.completedJobs) },
    { k: 'Total volume', v: `${fmt(d.totals.totalVolume)}`, unit: 'demo credits' },
    { k: 'Capable agents', v: `${d.meta.capableAgents.ready}/${d.meta.capableAgents.total}` },
    { k: 'Services live', v: fmt(d.meta.servicesLive) },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 sm:px-8">
      <div className="material-clear" style={{ padding: 0 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4" role="group" aria-label="Live market figures" aria-live="polite">
          {cells.map((c, i) => (
            <div key={c.k} className="px-5 py-4" style={{ borderRight: i % 4 !== 3 ? `1px solid ${C.hairline}` : undefined, borderBottom: i < 2 ? `1px solid ${C.hairline}` : undefined }}>
              <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>{c.k}</div>
              <div className="t-numeral mt-0.5" style={{ color: C.ink, fontSize: 24, lineHeight: 1.1 }}>{c.v}</div>
              {c.unit && <div style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 10.5 }}>{c.unit}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
        <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11 }}>live from the auditor’s ledger view · {fmtTime(d.asOfUtc)}</span>
      </div>
    </div>
  );
}
