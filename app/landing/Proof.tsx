'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Deal, Persona, isVisible } from '../lens/types';
import { RevealField } from '../lens/components/RevealField';
import { C, FONT, refocusIn, refocusOut } from '../lens/components/theme';
import { Reveal } from './Reveal';

const usd = (n: number) => `$${n}`;

// The auto-cycle: public (all sealed) → provider A (own bid) → auditor
// (settlement yes, bids no) → buyer (all).
const CYCLE: { id: Persona; label: string }[] = [
  { id: 'public', label: 'Public' },
  { id: 'providerA', label: 'Provider A' },
  { id: 'auditor', label: 'Auditor' },
  { id: 'buyer', label: 'Buyer' },
];

export function Proof({ seedDeal }: { seedDeal: Deal }) {
  return (
    <section className="relative w-full px-6 py-28 sm:py-36" style={{ background: C.bg }}>
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
              The proof
            </div>
            <h2 className="t-h2 mx-auto mt-4" style={{ color: C.ink }}>
              Don&rsquo;t trust the claim. Switch the persona.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mx-auto mt-10 max-w-3xl">
            <LensPreview seedDeal={seedDeal} />
            <p className="mt-4 text-center text-[12px]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
              Preview on a sample deal. In the live product, every field&rsquo;s visibility is read back from the Canton ledger — the UI cannot lie.
            </p>
            <div className="mt-7 flex justify-center">
              <Link
                href="/lens"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium no-underline"
                style={{ background: C.ink, color: '#fff', fontFamily: FONT.sans }}
              >
                Run a live negotiation
                <span aria-hidden style={{ fontSize: 12 }}>→</span>
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LensPreview({ seedDeal }: { seedDeal: Deal }) {
  const reduce = useReducedMotion();
  const [persona, setPersona] = useState<Persona>('buyer');
  const [auto, setAuto] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  // Only auto-cycle while the preview is actually on screen — an off-screen /
  // backgrounded tab never advances it, so it can't wedge or waste work.
  const onScreen = useInView(rootRef, { amount: 0.3 });

  useEffect(() => {
    if (reduce || !auto || !onScreen) return;
    const id = setInterval(() => {
      setPersona((p) => CYCLE[(CYCLE.findIndex((c) => c.id === p) + 1) % CYCLE.length].id);
    }, 2500);
    return () => clearInterval(id);
  }, [reduce, auto, onScreen]);

  const pick = (id: Persona) => {
    setAuto(false);
    setPersona(id);
  };

  return (
    <div ref={rootRef} className="tacit-card overflow-hidden">
      {/* Faux product chrome + honest PREVIEW marker */}
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: C.hairline }}>
        <span className="flex items-baseline gap-1" style={{ fontFamily: FONT.sans }}>
          <span className="text-[13px] font-semibold lowercase" style={{ color: C.ink, letterSpacing: '-0.02em' }}>tacit</span>
          <span className="mb-0.5 inline-block h-1 w-1 rounded-full" style={{ background: C.violet }} aria-hidden />
          <span className="ml-1.5 text-[11px] uppercase tracking-[0.12em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>Ledger Lens</span>
        </span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.ink3, background: 'rgba(10,10,11,0.05)', fontFamily: FONT.mono }}>
          Preview
        </span>
      </div>

      <div className="p-4 sm:p-6">
        {/* Persona chip row */}
        <div className="inline-flex flex-wrap gap-1 rounded-full p-1" style={{ background: 'rgba(10,10,11,0.04)', border: `1px solid ${C.hairline}` }}>
          {CYCLE.map((c) => {
            const active = c.id === persona;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="relative rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{ color: active ? '#fff' : C.ink2, fontFamily: FONT.sans, transition: 'color 0.2s var(--micro-ease)' }}
              >
                {active && (
                  <motion.span layoutId="preview-pill" className="absolute inset-0 rounded-full" style={{ background: C.violet }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} />
                )}
                <span className="relative z-10">{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* Cards — non-blocking crossfade (refocus) on persona change. The
            outgoing + incoming personas share one grid cell, so they crossfade
            without a layout jump AND the new content mounts immediately (no
            mode="wait" barrier) — an unattended/backgrounded tab can never wedge it. */}
        <div className="mt-4" style={{ display: 'grid' }}>
          <AnimatePresence>
            <motion.div
              key={persona}
              className="grid gap-3"
              style={{ gridArea: '1 / 1' }}
              initial={{ filter: 'blur(8px)', opacity: 0 }}
              animate={{ filter: 'blur(0px)', opacity: 1, transition: refocusIn }}
              exit={{ filter: 'blur(8px)', opacity: 0, transition: refocusOut }}
            >
            <PreviewCard title="The request">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                <RevealField label="Buyer" field={seedDeal.rfs.buyer} persona={persona} />
                <RevealField label="Budget" field={seedDeal.rfs.budget} persona={persona} mono />
                <RevealField label="Service" field={seedDeal.rfs.title} persona={persona} />
                <RevealField label="Deal" field={seedDeal.existence} persona={persona} />
              </div>
            </PreviewCard>

            <PreviewCard title="Sealed bids">
              <div className="grid gap-2.5">
                {seedDeal.bids.map((b) => (
                  <div key={b.id} className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                    <RevealField label="Bidder" field={b.providerLabel} persona={persona} />
                    <RevealField label="Sealed price" field={b.amount} persona={persona} mono format={usd} />
                  </div>
                ))}
              </div>
            </PreviewCard>

            <PreviewCard title="Settlement">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                <RevealField label="Status" field={seedDeal.settlement.status} persona={persona} />
                <RevealField label="Winner" field={seedDeal.settlement.winner} persona={persona} />
                <RevealField label="Settled amount" field={seedDeal.settlement.amount} persona={persona} mono format={usd} />
                <RevealField label="Contract" field={seedDeal.settlement.txId} persona={persona} mono />
              </div>
            </PreviewCard>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.hairline}` }}>
      <h3 className="mb-3 text-[13px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>{title}</h3>
      {children}
    </div>
  );
}
