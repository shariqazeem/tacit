'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Step } from '../agents/negotiation';
import { C, FONT, glassBlur, microEase, settle, springLayout } from './theme';
import { AgentGlyph, type GlyphId } from './AgentGlyph';

const STEP_MS = 1100;
const TYPING_MS = 600;

// ── Transcript → identities (presentational parsing only) ──────
function glyphFor(actor: string): GlyphId {
  const a = actor.toLowerCase();
  if (a.startsWith('buyer')) return 'buyer';
  if (a === 'tacit') return 'system';
  if (a.includes(' a')) return 'A';
  if (a.includes(' b')) return 'B';
  if (a.includes(' c')) return 'C';
  return 'system';
}
const isBid = (s: Step) => /sealed bid/i.test(s.action);
const isAward = (s: Step) => /awarded deal/i.test(s.action);

// Progress rail
const RAIL = ['RFS POSTED', 'BIDS SEALED', 'AWARD', 'SETTLED'] as const;

/**
 * Phase 2 — the live sealed-bid feed. Drives itself off the transcript:
 * providers seal their prices (scramble → 🔒 SEALED), the buyer awards the
 * lowest, losers fold away and a settlement materializes, then it hands off to
 * the Lens reveal. Purely presentational; onDone must be stable.
 */
export function NegotiationTheater({
  transcript,
  onDone,
  usedLLM,
  paidAmount,
  paidCurrency,
}: {
  transcript: Step[];
  onDone: () => void;
  /** True when the bids came from a real LLM (not the deterministic fallback). */
  usedLLM?: boolean;
  /** Set only for a live-ledger deal — drives the "payment transferred" count-up. */
  paidAmount?: number;
  paidCurrency?: string;
}) {
  const reduce = useReducedMotion();
  const total = transcript.length;

  // Derived cast: ordered providers + winner label.
  const providers = useMemo(
    () => transcript.filter(isBid).map((s) => ({ label: s.actor, glyph: glyphFor(s.actor) })),
    [transcript],
  );
  const winnerLabel = useMemo(() => {
    const a = transcript.find(isAward);
    return a ? a.detail.replace(/\s+selected$/i, '').trim() : providers[providers.length - 1]?.label ?? '';
  }, [transcript, providers]);

  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState<GlyphId | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [settled, setSettled] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);

  // Elapsed timer.
  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, []);

  // Scheduler.
  useEffect(() => {
    if (total === 0) {
      onDone();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (reduce) {
      // Reduced motion: reveal everything at once, then hand off.
      setShown(total);
      setAwarding(true);
      setSettled(true);
      timers.push(setTimeout(onDone, 1400));
      return () => timers.forEach(clearTimeout);
    }

    for (let i = 0; i < total; i++) {
      timers.push(setTimeout(() => setTyping(glyphFor(transcript[i].actor)), i * STEP_MS));
      timers.push(
        setTimeout(() => {
          setTyping(null);
          setShown(i + 1);
          if (isAward(transcript[i])) setAwarding(true);
        }, i * STEP_MS + TYPING_MS),
      );
    }
    const end = total * STEP_MS;
    timers.push(setTimeout(() => setSettled(true), end + 200));
    timers.push(setTimeout(onDone, end + 1500));
    return () => timers.forEach(clearTimeout);
  }, [transcript, total, onDone, reduce]);

  // Keep the feed scrolled to the latest bubble.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [shown, typing, reduce]);

  const sealedLabels = useMemo(
    () => new Set(transcript.slice(0, shown).filter(isBid).map((s) => s.actor)),
    [transcript, shown],
  );
  const stage = settled ? 3 : awarding ? 2 : sealedLabels.size >= providers.length && providers.length > 0 ? 1 : shown >= 1 ? 0 : -1;

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <section className="relative min-h-[100svh] w-full overflow-hidden" style={{ background: C.bg }}>
      {/* Whole-page dim during the award beat (~6%). */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-30"
        style={{ background: 'rgba(10,10,11,0.06)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: awarding && !settled ? 1 : 0 }}
        transition={{ duration: 0.4, ease: microEase }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[720px] px-6 pb-28 pt-24">
        {/* Header */}
        <div className="mb-7 flex items-center gap-2.5">
          <span className="tacit-pulse inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.violet }} />
          <span className="text-[13px] font-medium" style={{ color: C.ink, fontFamily: FONT.sans }}>
            Sealed-bid negotiation in progress
          </span>
          {usedLLM && (
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: C.violet, background: C.violetSoft, fontFamily: FONT.mono }}
              title="Bids produced by a live LLM (not the deterministic fallback)"
            >
              LLM agents
            </span>
          )}
          <span
            className="tacit-num ml-auto rounded-full px-2.5 py-1 text-[12px]"
            style={{ color: C.ink2, background: 'rgba(10,10,11,0.04)' }}
          >
            {mm}:{ss}
          </span>
        </div>

        {/* Progress rail */}
        <ProgressRail stage={stage} />

        {/* Sealed-bid arena */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {providers.map((p) => (
            <BidSlot
              key={p.label}
              provider={p}
              sealed={sealedLabels.has(p.label)}
              awarding={awarding}
              won={p.label === winnerLabel}
              reduce={!!reduce}
            />
          ))}
        </div>
        <p className="mt-3 text-center text-[12px]" style={{ color: C.ink3, fontFamily: FONT.sans }}>
          Each price is visible only to its provider and the buyer.
        </p>

        {/* Narration feed */}
        <div
          ref={feedRef}
          className="tacit-card mt-8 flex max-h-[248px] flex-col gap-2.5 overflow-y-auto p-4"
        >
          <AnimatePresence initial={false}>
            {transcript.slice(0, shown).map((s, i) => (
              <MessageBubble key={i} step={s} />
            ))}
            {typing && <TypingBubble key="typing" glyph={typing} />}
          </AnimatePresence>
        </div>

        {/* Settlement materialization */}
        <AnimatePresence>
          {settled && (
            <motion.div
              key="settle"
              className="tacit-card relative z-40 mx-auto mt-8 max-w-[440px] overflow-hidden p-6 text-center"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
              // The settlement LANDS: opacity/blur tween in, scale on a soft
              // spring so it settles with a ~2px bounce — the end of the award beat.
              animate={{
                opacity: 1,
                scale: 1,
                filter: 'blur(0px)',
                transition: { default: { duration: 0.4, ease: microEase }, scale: reduce ? { duration: 0.001 } : settle },
              }}
            >
              <div
                className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: 'rgba(13,148,136,0.1)' }}
              >
                <CheckMark />
              </div>
              <div className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>
                Awarded to {winnerLabel || 'the lowest bid'}
              </div>
              <div className="mt-1 text-[13px] leading-relaxed" style={{ color: C.ink2, fontFamily: FONT.sans }}>
                Losing bids archived and the settlement created in one Canton transaction.
              </div>

              {/* Ledger-only receipt: value moved inside the same transaction. */}
              {paidAmount != null && (
                <motion.div
                  className="mt-4 flex items-center justify-center gap-2 border-t pt-4"
                  style={{ borderColor: C.hairline }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.35, duration: 0.3, ease: microEase }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12.5 L10 17.5 L19 7" stroke={C.live} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[12px] font-medium" style={{ color: C.ink2, fontFamily: FONT.sans }}>
                    Payment transferred — same transaction
                  </span>
                  <span className="tacit-num text-[13px] font-semibold" style={{ color: C.ink }}>
                    <CountUp to={paidAmount} reduce={!!reduce} />
                  </span>
                  {paidCurrency && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                      style={{ color: C.live, background: 'rgba(13,148,136,0.12)', fontFamily: FONT.mono }}
                    >
                      {paidCurrency}
                    </span>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ── Progress rail ─────────────────────────────────────────────
function ProgressRail({ stage }: { stage: number }) {
  return (
    <div className="flex items-center">
      {RAIL.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
        const on = done || active;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <span className="relative flex h-4 w-4 items-center justify-center">
                {active && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ border: `1.5px solid ${C.violet}` }}
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <motion.span
                  className="h-2.5 w-2.5 rounded-full"
                  animate={{
                    background: on ? C.violet : 'rgba(10,10,11,0.14)',
                    scale: active ? 1.1 : 1,
                  }}
                  transition={springLayout}
                />
              </span>
              <span
                className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: on ? C.ink2 : C.ink3, fontFamily: FONT.mono }}
              >
                {label}
              </span>
            </div>
            {i < RAIL.length - 1 && (
              <div className="mx-1.5 mb-5 h-px flex-1 overflow-hidden" style={{ background: 'rgba(10,10,11,0.1)' }}>
                <motion.div
                  className="h-full"
                  style={{ background: C.violet, transformOrigin: 'left' }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i < stage ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: microEase }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bid slot (sealing + award choreography) ───────────────────
function BidSlot({
  provider,
  sealed,
  awarding,
  won,
  reduce,
}: {
  provider: { label: string; glyph: GlyphId };
  sealed: boolean;
  awarding: boolean;
  won: boolean;
  reduce: boolean;
}) {
  const folded = awarding && !won;

  return (
    <motion.div
      className="tacit-card relative flex flex-col items-center gap-2 p-3.5"
      style={{ transformStyle: 'preserve-3d', zIndex: won && awarding ? 40 : 10 }}
      animate={folded ? { rotateX: -90, opacity: 0, scale: 0.9 } : { rotateX: 0, opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0.001 : 0.5, ease: microEase }}
    >
      {/* Award ring */}
      {won && awarding && !reduce && (
        <motion.span
          className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ border: `1.5px solid ${C.violet}` }}
          initial={{ scale: 0.5, opacity: 0.55 }}
          animate={{ scale: [0.5, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 1.3, repeat: 2, ease: 'easeOut' }}
          aria-hidden
        />
      )}

      <AgentGlyph id={provider.glyph} size={26} />
      <span className="text-[12px] font-medium" style={{ color: C.ink, fontFamily: FONT.sans }}>
        {provider.label}
      </span>

      {won && awarding ? (
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: C.violet, background: C.violetSoft, fontFamily: FONT.mono }}
        >
          Awarded
        </span>
      ) : (
        <SealingChip sealed={sealed} reduce={reduce} />
      )}
    </motion.div>
  );
}

/** A number appears, scrambles, then blurs and collapses into 🔒 SEALED. No real price is ever shown. */
function SealingChip({ sealed, reduce }: { sealed: boolean; reduce: boolean }) {
  const [scrambling, setScrambling] = useState(false);
  const [glyphs, setGlyphs] = useState('$00');

  useEffect(() => {
    if (!sealed || reduce) return;
    setScrambling(true);
    const id = setInterval(() => {
      const n = 10 + Math.floor(Math.random() * 89);
      setGlyphs(`$${n}`);
    }, 55);
    const stop = setTimeout(() => {
      clearInterval(id);
      setScrambling(false);
    }, TYPING_MS);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [sealed, reduce]);

  if (!sealed) {
    return (
      <span className="tacit-num text-[12px]" style={{ color: C.ink3 }}>
        awaiting bid
      </span>
    );
  }

  if (scrambling) {
    return (
      <motion.span
        className="tacit-num text-[13px] font-semibold"
        style={{ color: C.ink2 }}
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 0.3, repeat: Infinity }}
      >
        {glyphs}
      </motion.span>
    );
  }

  return (
    <motion.span
      className="inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        color: C.ink2,
        background: 'rgba(10,10,11,0.045)',
        border: `1px solid ${C.hairline}`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontFamily: FONT.mono,
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 0.96, filter: 'blur(0px)' }}
      transition={{ duration: 0.32, ease: microEase }}
    >
      <span aria-hidden>🔒</span> SEALED
    </motion.span>
  );
}

// ── Feed bubbles ──────────────────────────────────────────────
function MessageBubble({ step }: { step: Step }) {
  const glyph = glyphFor(step.actor);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springLayout}
      className="flex items-start gap-2.5"
    >
      <AgentGlyph id={glyph} size={26} />
      <div className="tacit-glass min-w-0 flex-1 rounded-2xl rounded-tl-md px-3.5 py-2.5" style={glassBlur}>
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>
            {step.actor}
          </span>
          <span className="tacit-num text-[10.5px]" style={{ color: C.ink3 }}>
            {step.t}
          </span>
        </div>
        <div className="mt-0.5 text-[13px]" style={{ color: C.ink2, fontFamily: FONT.sans }}>
          {isBid(step) && (
            <span aria-hidden style={{ marginRight: 5 }}>🔒</span>
          )}
          <span style={{ color: C.ink, fontWeight: 500 }}>{step.action}</span>
          <span style={{ color: C.ink3 }}> · {step.detail}</span>
        </div>
      </div>
    </motion.div>
  );
}

function TypingBubble({ glyph }: { glyph: GlyphId }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={springLayout}
      className="flex items-center gap-2.5"
    >
      <AgentGlyph id={glyph} size={26} />
      <div className="tacit-glass inline-flex items-center gap-1 rounded-2xl rounded-tl-md px-3.5 py-3" style={glassBlur}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: C.ink3 }}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function CheckMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5 L10 17.5 L19 7" stroke={C.live} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ~400ms count-up to the paid amount (jumps straight to it under reduced motion). */
function CountUp({ to, reduce }: { to: number; reduce: boolean }) {
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setN(to);
      return;
    }
    const controls = animate(0, to, { duration: 0.4, ease: 'easeOut', onUpdate: (v) => setN(v) });
    return () => controls.stop();
  }, [to, reduce]);
  return <>{`$${Math.round(n)}`}</>;
}
