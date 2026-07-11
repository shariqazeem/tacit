'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { C, FONT, microEase } from '../lens/components/theme';
import { AgentGlyph, type GlyphId } from '../lens/components/AgentGlyph';
import { Reveal } from './Reveal';

const STEPS = [
  { n: '01', label: 'RFS POSTED', glyphs: ['buyer'], desc: 'A buyer agent posts a request and a budget.' },
  { n: '02', label: 'BIDS SEALED', glyphs: ['A', 'B', 'C'], desc: 'Each price is visible only to its provider and the buyer.' },
  { n: '03', label: 'AWARD', glyphs: ['buyer', 'system'], desc: 'One Daml transaction: losing bids archived, winner accepted.' },
  { n: '04', label: 'PAID', glyphs: ['system'], desc: 'The demo IOU transfers inside the same transaction.' },
] as const;

export function Mechanic() {
  return (
    <section id="mechanic" className="relative w-full px-6 py-28 sm:py-36" style={{ background: C.bg }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
            The mechanic
          </div>
          <h2 className="t-h2 mt-4" style={{ color: C.ink }}>
            Sealed bids. Atomic award.
          </h2>
        </Reveal>

        {/* Step strip — horizontal on desktop, vertical on mobile */}
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <StepCard step={s} />
            </Reveal>
          ))}
        </div>

        {/* Ledger-privacy callout */}
        <Reveal delay={0.1}>
          <div
            className="mt-6 rounded-2xl px-5 py-4 text-[15px] leading-relaxed sm:px-6 sm:py-5"
            style={{ background: C.violetSoft, border: '1px solid rgba(124,58,237,0.14)', color: C.ink2, fontFamily: FONT.sans }}
          >
            <span style={{ color: C.violet, fontWeight: 600 }}>Privacy here isn&rsquo;t a promise in the app</span> — it&rsquo;s the
            signatory/observer model of the ledger itself. A competitor&rsquo;s node never even receives the data.{' '}
            <span style={{ color: C.ink }}>Even oversight is scoped: an auditor can verify settlements without seeing a single sealed bid.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="tacit-card flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
          {step.n}
        </span>
        <span className="flex items-center gap-1">
          {step.glyphs.map((g) => (
            <AgentGlyph key={g} id={g as GlyphId} size={22} />
          ))}
        </span>
      </div>

      <div className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.ink, fontFamily: FONT.mono }}>
        {step.label}
      </div>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed" style={{ color: C.ink2, fontFamily: FONT.sans }}>
        {step.desc}
      </p>

      {step.label === 'BIDS SEALED' && <SealChip />}
      {step.label === 'PAID' && <PaidChip />}
    </div>
  );
}

/** A price that seals into a 🔒 chip when the card scrolls into view. */
function SealChip() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15%' });
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    if (reduce) {
      setSealed(true);
      return;
    }
    if (!inView) return;
    const t = setTimeout(() => setSealed(true), 650);
    return () => clearTimeout(t);
  }, [inView, reduce]);

  return (
    <div ref={ref} className="mt-3 flex h-7 items-center">
      <AnimatePresence mode="wait" initial={false}>
        {!sealed ? (
          <motion.span
            key="price"
            className="tacit-num text-[13px] font-semibold"
            style={{ color: C.ink2 }}
            exit={{ opacity: 0, filter: 'blur(6px)', scale: 0.96 }}
            transition={{ duration: 0.25, ease: microEase }}
          >
            $28
          </motion.span>
        ) : (
          <motion.span
            key="sealed"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: C.ink2,
              background: 'rgba(10,10,11,0.045)',
              border: `1px solid ${C.hairline}`,
              fontFamily: FONT.mono,
            }}
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 1.06, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.3, ease: microEase }}
          >
            <span aria-hidden>🔒</span> SEALED
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A mono count-up to the paid amount + "same transaction" check, on view. */
function PaidChip() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15%' });
  const [n, setN] = useState(reduce ? 28 : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, 28, { duration: 0.5, ease: 'easeOut', delay: 0.2, onUpdate: (v) => setN(v) });
    return () => controls.stop();
  }, [inView, reduce]);

  return (
    <div ref={ref} className="mt-3 flex h-7 items-center gap-2">
      <span className="tacit-num text-[15px] font-semibold" style={{ color: C.ink }}>
        {`$${Math.round(n)}`}
      </span>
      <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ color: C.live, background: 'rgba(13,148,136,0.12)', fontFamily: FONT.mono }}>
        USD.demo
      </span>
      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: C.ink3, fontFamily: FONT.sans }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5 L10 17.5 L19 7" stroke={C.live} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        same tx
      </span>
    </div>
  );
}
