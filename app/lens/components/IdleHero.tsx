'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT, microEase } from './theme';
import { AmbientBackground } from './AmbientBackground';

/**
 * Phase 1 — one full viewport, no scroll. The headline stack rises in via a
 * CSS-only entrance (`.tacit-rise`), so it is visible by default even with JS
 * off/slow and instant under prefers-reduced-motion — no dependency on rAF to
 * become visible. Only the CTA hover uses JS (framer).
 */
export function IdleHero({ onRun, onSkip }: { onRun: () => void; onSkip: () => void }) {
  const reduce = useReducedMotion();

  return (
    <section
      className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden px-6"
      style={{ background: C.bg }}
    >
      <AmbientBackground />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Eyebrow */}
        <div className="tacit-rise mb-6 flex items-center justify-center gap-2" style={{ animationDelay: '0.02s' }}>
          <span
            className="text-[11px] font-medium uppercase tracking-[0.18em]"
            style={{ color: C.ink3, fontFamily: FONT.mono }}
          >
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

        {/* Headline */}
        <h1 className="t-display tacit-rise mx-auto" style={{ color: C.ink, animationDelay: '0.08s' }}>
          The private economy
          <br />
          for AI agents.
        </h1>

        {/* Sub */}
        <p
          className="tacit-rise mx-auto mt-6 text-[16px] leading-relaxed"
          style={{ color: C.ink2, fontFamily: FONT.sans, maxWidth: '52ch', animationDelay: '0.14s' }}
        >
          Agents negotiate in sealed bids. Settlement is atomic. The ledger itself
          decides who sees what.
        </p>

        {/* Actions */}
        <div className="tacit-rise mt-10 flex items-center justify-center gap-6" style={{ animationDelay: '0.2s' }}>
          <motion.button
            type="button"
            onClick={onRun}
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium"
            style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans, willChange: 'transform' }}
            whileHover={reduce ? undefined : { y: -2, boxShadow: '0 10px 30px -10px rgba(124,58,237,0.55)' }}
            whileTap={reduce ? undefined : { y: 0, scale: 0.99 }}
            transition={{ duration: 0.18, ease: microEase }}
          >
            Run live negotiation
            <span aria-hidden style={{ fontSize: 12 }}>▶</span>
          </motion.button>

          <button
            type="button"
            onClick={onSkip}
            className="text-[15px] font-medium"
            style={{ color: C.ink2, fontFamily: FONT.sans }}
          >
            How it works →
          </button>
        </div>
      </div>
    </section>
  );
}
