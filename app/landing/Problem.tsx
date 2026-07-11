'use client';

import { motion } from 'framer-motion';
import { C, FONT, microEase } from '../lens/components/theme';
import { Reveal } from './Reveal';

const RED = '#DC2626';

const ROWS = [
  { a: 'AcmeAgent', b: 'DataCo', amt: '$312.00', tx: '0x9f4c…' },
  { a: 'AcmeAgent', b: 'ComputeX', amt: '$88.00', tx: '0x3a17…' },
  { a: 'AcmeAgent', b: 'ModelHub', amt: '$540.00', tx: '0x7c02…' },
];

export function Problem() {
  return (
    <section className="relative w-full px-6 py-28 sm:py-36" style={{ background: C.bg }}>
      <div className="mx-auto grid max-w-6xl items-center gap-14 md:grid-cols-2">
        {/* Left — copy */}
        <Reveal>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
            The problem
          </div>
          <h2 className="t-h2 mt-4" style={{ color: C.ink }}>
            Transparent chains
            <br />
            leak your business.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed" style={{ color: C.ink2, fontFamily: FONT.sans, maxWidth: '46ch' }}>
            On a public chain, an agent&rsquo;s every negotiation exposes prices, counterparties, and
            margins. Competitors read the mempool and front-run your strategy before the deal even
            settles.
          </p>
        </Reveal>

        {/* Right — the leak vignette (schematic, not skeuomorphic) */}
        <Reveal delay={0.08}>
          <div className="tacit-card overflow-hidden p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
                Public mempool
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: RED, background: 'rgba(220,38,38,0.08)', fontFamily: FONT.mono }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: RED }} />
                visible to everyone
              </span>
            </div>

            <div className="flex flex-col">
              {ROWS.map((r, i) => (
                <div key={r.b} className="relative">
                  {/* Competitor highlight sweeps the first row on scroll-in. */}
                  {i === 0 && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 rounded-lg"
                      style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', transformOrigin: 'left' }}
                      initial={{ scaleX: 0, opacity: 0 }}
                      whileInView={{ scaleX: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, ease: microEase, delay: 0.5 }}
                    />
                  )}
                  <div
                    className="relative grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 text-[12px]"
                    style={{ borderTop: i ? `1px solid ${C.hairline}` : 'none', fontFamily: FONT.mono }}
                  >
                    <span style={{ color: C.ink2 }}>
                      {r.a} <span style={{ color: C.ink3 }}>→</span> {r.b}
                    </span>
                    <span className="tabular-nums" style={{ color: C.ink, fontWeight: 600 }}>{r.amt}</span>
                    <span style={{ color: C.ink3 }}>{r.tx}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Competitor cursor */}
            <motion.div
              className="pointer-events-none mt-1 flex items-center gap-1.5"
              initial={{ opacity: 0, x: -8, y: -6 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: microEase, delay: 0.75 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 3 L19 12 L12 13 L15 20 L12 21 L9 14 L5 17 Z" fill={RED} />
              </svg>
              <span className="text-[10.5px]" style={{ color: RED, fontFamily: FONT.mono }}>competitor reads your price</span>
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
