'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { C, FONT } from '../lens/components/theme';
import { AmbientArt } from './AmbientArt';
import { Reveal } from './Reveal';

const REPO = 'https://github.com/shariqazeem/tacit';

const STATIC_STATS = ['1 atomic transaction', '5 personas · ledger-derived visibility', 'USD.demo voucher today — stablecoin next'];

export function Close() {
  // Progressive enhancement: if the live ledger economy is reachable, the chips
  // become real (never fabricated). Otherwise the honest static chips stay.
  const [live, setLive] = useState<{ deals: number; moved: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/economy', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.available) setLive({ deals: d.totals.deals, moved: d.totals.moved });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = live
    ? [`${live.deals} deals settled`, `$${live.moved} USD.demo moved`, '3 provider agents']
    : STATIC_STATS;

  return (
    <section className="relative w-full overflow-hidden px-6 py-32 sm:py-40" style={{ background: C.bg }}>
      <AmbientArt
        src="/art/atomicsettlement.webp"
        opacity={0.42}
        width={1200}
        height={800}
        style={{ top: '50%', left: '50%', width: 'min(80vw, 900px)', height: 'auto', transform: 'translate(-50%, -50%)' }}
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="t-h2 mx-auto" style={{ color: C.ink }}>
            Built on Canton.
            <br />
            Built for the agent economy.
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
            {stats.map((s) => (
              <span
                key={s}
                className="rounded-full px-3.5 py-1.5 text-[12px]"
                style={{ color: C.ink2, background: C.surface, border: `1px solid ${C.hairline}`, fontFamily: FONT.mono }}
              >
                {s}
              </span>
            ))}
          </div>
          {live && (
            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: C.live, fontFamily: FONT.mono }}>
              <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
              Derived from live Canton queries
            </div>
          )}
        </Reveal>

        <Reveal delay={0.16}>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/work"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium no-underline"
              style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans }}
            >
              Run real work
              <span aria-hidden style={{ fontSize: 12 }}>→</span>
            </Link>
            <Link
              href="/lens"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-medium no-underline"
              style={{ color: C.ink, background: 'rgba(10,10,11,0.04)', border: `1px solid ${C.hairline}`, fontFamily: FONT.sans }}
            >
              Ledger Lens <span aria-hidden style={{ fontSize: 12 }}>→</span>
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-medium no-underline"
              style={{ color: C.ink2, fontFamily: FONT.sans }}
            >
              GitHub <span aria-hidden style={{ fontSize: 12 }}>↗</span>
            </a>
          </div>
        </Reveal>
      </div>

      {/* Footer */}
      <div className="relative z-10 mx-auto mt-24 flex max-w-6xl items-center justify-center gap-3 text-[12px]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
        <span className="flex items-baseline gap-1">
          <span className="font-semibold lowercase" style={{ color: C.ink2, letterSpacing: '-0.02em' }}>tacit</span>
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: C.violet }} aria-hidden />
        </span>
        <span aria-hidden>·</span>
        <span>Canton hackathon 2026</span>
      </div>
    </section>
  );
}
