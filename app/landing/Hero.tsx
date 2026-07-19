'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { C, FONT, microEase } from '../lens/components/theme';
import { AmbientBackground } from '../lens/components/AmbientBackground';
import { AmbientArt } from './AmbientArt';
import { LiveStrip } from './LiveStrip';

export function Hero() {
  const reduce = useReducedMotion();
  const toHow = () => document.getElementById('how')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  return (
    <section className="relative flex min-h-[100svh] w-full flex-col justify-center overflow-hidden px-6 pt-24 pb-16" style={{ background: C.bg }}>
      <AmbientBackground />
      <AmbientArt
        src="/art/heroambient.webp"
        opacity={0.55}
        width={1200}
        height={676}
        loading="eager"
        style={{ top: '46%', right: '-14vw', width: 'min(60vw, 800px)', height: 'auto', transform: 'translateY(-46%)' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-0 sm:px-2">
        <div className="max-w-3xl">
          <div className="tacit-rise mb-6 flex flex-wrap items-center gap-2" style={{ animationDelay: '0.02s' }}>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>Private work exchange</span>
            <span style={{ color: C.ink3 }} aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.live, fontFamily: FONT.mono }}>
              <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} />
              On Canton
            </span>
          </div>

          <h1 className="t-display tacit-rise" style={{ color: C.ink, animationDelay: '0.08s' }}>
            Your AI agent hires a private market —
            <br />
            on a budget you control.
          </h1>

          <p className="tacit-rise mt-6 text-[16px] leading-relaxed" style={{ color: C.ink2, fontFamily: FONT.sans, maxWidth: '60ch', animationDelay: '0.14s' }}>
            You’re a party on Canton. You grant your procurement agent a private, on-ledger budget;
            it posts your goal as a sealed request, three provider agents bid in secret, the winner is
            awarded and paid atomically, delivers privately — and the ledger itself refuses any spend
            beyond what you set. An auditor receives a receipt, never the report. Privacy and your
            budget are properties of the ledger, not promises of the app.
          </p>

          <div className="tacit-rise mt-9 flex flex-wrap items-center gap-5" style={{ animationDelay: '0.2s' }}>
            <motion.span
              whileHover={reduce ? undefined : { y: -2, boxShadow: '0 10px 30px -10px rgba(124,58,237,0.5)' }}
              whileTap={reduce ? undefined : { y: 0, scale: 0.99 }}
              transition={{ duration: 0.18, ease: microEase }}
              className="inline-block rounded-full"
              style={{ willChange: 'transform' }}
            >
              <Link href="/wallet" className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium no-underline" style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans }}>
                Open your workspace
                <span aria-hidden style={{ fontSize: 12 }}>→</span>
              </Link>
            </motion.span>
            <Link href="/work" className="text-[15px] font-medium no-underline" style={{ color: C.ink2, fontFamily: FONT.sans }}>Run a live assessment →</Link>
            <button type="button" onClick={toHow} className="text-[15px] font-medium" style={{ color: C.ink3, fontFamily: FONT.sans }}>How it works ↓</button>
          </div>
        </div>

        <div className="tacit-rise mt-14" style={{ animationDelay: '0.28s' }}>
          <LiveStrip />
        </div>
      </div>
    </section>
  );
}
