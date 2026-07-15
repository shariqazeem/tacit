'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { C, FONT } from '../lens/components/theme';
import { Sealed } from '../work/components/bits';
import { Reveal } from './Reveal';

type Row = { acceptedAtUtc: string; receiptCidShort: string; sha256Short: string; winnerLabel: string | null; amount: number | null; serviceType: string | null };
type Overview = { available: true; receipts: Row[]; totals: { completedJobs: number } };

const SVC: Record<string, string> = { vendor_security_assessment: 'Vendor security', web_performance_probe: 'Web performance', site_audit: 'Site audit' };
const svcLabel = (s: string | null) => (s ? SVC[s] || s : '—');
function fmtTime(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  const mm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${mm} ${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function MarketPreview() {
  const [d, setD] = useState<Overview | null>(null);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/market/overview', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j?.available === true) setD(j); else setDead(true);
      } catch { if (alive) setDead(true); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section className="w-full px-6 py-24 sm:py-28" style={{ background: C.bg }}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Live market · the auditor’s view</div>
              <h2 className="mt-3 t-h2" style={{ color: C.ink, maxWidth: '22ch' }}>Real settlements. Sealed bodies.</h2>
            </div>
            <Link href="/market" className="text-[14px] font-medium no-underline" style={{ color: C.ink2, fontFamily: FONT.sans }}>Open the full market →</Link>
          </div>
          <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15, lineHeight: 1.6, maxWidth: '58ch' }}>
            These delivery receipts are what a permissioned auditor can lawfully read — commitment, winner,
            amount, time. The report body is a Frost cell because the ledger seals it: the auditor is not a
            stakeholder of the delivery, so Canton won’t return it.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          {dead || !d ? (
            <div className="material-clear mt-8 p-5" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 14 }}>The live feed is momentarily unavailable — the full market is at <Link href="/market" style={{ color: C.ink2 }}>/market</Link>.</div>
          ) : (
            <div className="material-clear mt-8" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                      {['Time (UTC)', 'SHA-256 commitment', 'Winner', 'Amount', 'Service', 'Report body'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.receipts.slice(0, 5).map((r, i) => (
                      <tr key={r.receiptCidShort + i} style={{ borderBottom: i < 4 ? `1px solid ${C.hairline}` : 'none' }}>
                        <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(r.acceptedAtUtc)}</td>
                        <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.sha256Short}</td>
                        <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{r.winnerLabel ?? '—'}</td>
                        <td className="px-4 py-2.5" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{r.amount == null ? '—' : r.amount}</td>
                        <td className="px-4 py-2.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12, whiteSpace: 'nowrap' }}>{svcLabel(r.serviceType)}</td>
                        <td className="px-4 py-2.5" style={{ whiteSpace: 'nowrap' }}><span className="material-frost inline-flex items-center px-2.5 py-1"><Sealed /></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}
