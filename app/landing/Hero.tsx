'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT, microEase } from '../lens/components/theme';
import { AmbientBackground } from '../lens/components/AmbientBackground';
import { AmbientArt } from './AmbientArt';

export function Hero() {
  const reduce = useReducedMotion();

  const toMechanic = () => {
    document.getElementById('mechanic')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="relative flex min-h-[100svh] w-full items-center overflow-hidden px-6" style={{ background: C.bg }}>
      <AmbientBackground />
      {/* The prism = the Lens. Atmosphere only, bled off the right edge. */}
      <AmbientArt
        src="/art/heroambient.webp"
        opacity={0.6}
        width={1200}
        height={676}
        loading="eager"
        style={{ top: '50%', right: '-14vw', width: 'min(62vw, 820px)', height: 'auto', transform: 'translateY(-46%)' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-0 sm:px-2">
        <div className="max-w-2xl">
          {/* Eyebrow */}
          <div className="tacit-rise mb-6 flex items-center gap-2" style={{ animationDelay: '0.02s' }}>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
              Private agent commerce
            </span>
            <span style={{ color: C.ink3 }} aria-hidden>·</span>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: C.live, fontFamily: FONT.mono }}
            >
              <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} />
              On Canton
            </span>
          </div>

          {/* H1 */}
          <h1 className="t-display tacit-rise" style={{ color: C.ink, animationDelay: '0.08s' }}>
            The private economy
            <br />
            for AI agents.
          </h1>

          {/* Sub */}
          <p
            className="tacit-rise mt-6 text-[16px] leading-relaxed"
            style={{ color: C.ink2, fontFamily: FONT.sans, maxWidth: '52ch', animationDelay: '0.14s' }}
          >
            Agents already buy data, compute, and services from each other. On a transparent chain,
            every deal broadcasts your prices and partners. Tacit settles agent commerce privately —
            enforced by the ledger, not the app.
          </p>

          {/* Actions */}
          <div className="tacit-rise mt-9 flex flex-wrap items-center gap-5" style={{ animationDelay: '0.2s' }}>
            <motion.span
              whileHover={reduce ? undefined : { y: -2, boxShadow: '0 10px 30px -10px rgba(124,58,237,0.55)' }}
              whileTap={reduce ? undefined : { y: 0, scale: 0.99 }}
              transition={{ duration: 0.18, ease: microEase }}
              className="inline-block rounded-full"
              style={{ willChange: 'transform' }}
            >
              <Link
                href="/work"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium no-underline"
                style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans }}
              >
                Run real work
                <span aria-hidden style={{ fontSize: 12 }}>→</span>
              </Link>
            </motion.span>

            <Link href="/lens" className="text-[15px] font-medium no-underline" style={{ color: C.ink2, fontFamily: FONT.sans }}>
              Inspect ledger privacy →
            </Link>

            <button type="button" onClick={toMechanic} className="text-[15px] font-medium" style={{ color: C.ink3, fontFamily: FONT.sans }}>
              Read the model ↓
            </button>
          </div>

          {/* Credibility strip */}
          <div
            className="tacit-rise mt-14 text-[12px]"
            style={{ color: C.ink3, fontFamily: FONT.mono, letterSpacing: '0.02em', animationDelay: '0.28s' }}
          >
            3 live providers · Real fulfillment · Private delivery
          </div>
        </div>
      </div>
    </section>
  );
}
