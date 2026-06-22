'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Deal } from '../types';
import { LensView } from './LensView';
import { NegotiationTheater } from './NegotiationTheater';
import type { Step } from '../agents/negotiation';

const ACCENT = '#7C3AED';
const INK = '#0A0A0B';
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', sans-serif";

type Phase = 'idle' | 'running' | 'revealed';

/**
 * The /lens experience: idle hero → live negotiation theater → Lens reveal.
 * Fetches a real deal from /api/negotiate and feeds it to LensView (untouched).
 * Falls back to the seed deal if the engine is unreachable, so the demo never
 * dead-ends.
 */
export function LensExperience({ seedDeal }: { seedDeal: Deal }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [deal, setDeal] = useState<Deal>(seedDeal);
  const [transcript, setTranscript] = useState<Step[]>([]);
  const [usedLLM, setUsedLLM] = useState(false);
  const [ranOnce, setRanOnce] = useState(false);
  const [loading, setLoading] = useState(false);

  const reveal = useCallback(() => setPhase('revealed'), []);

  const run = useCallback(async () => {
    setPhase('running');
    setLoading(true);
    setTranscript([]);
    setRanOnce(true);
    try {
      const res = await fetch('/api/negotiate', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setDeal(data.deal);
      setUsedLLM(!!data.usedLLM);
      const t: Step[] = Array.isArray(data.transcript) ? data.transcript : [];
      setTranscript(t);
      setLoading(false);
      if (t.length === 0) setPhase('revealed');
    } catch {
      // Engine unreachable → reveal the seed deal directly.
      setDeal(seedDeal);
      setLoading(false);
      setPhase('revealed');
    }
  }, [seedDeal]);

  return (
    <div style={{ background: '#FAFAF9', minHeight: '100vh' }}>
      {/* Control (hidden on idle — the hero owns the CTA there) */}
      {phase !== 'idle' && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-2">
          {ranOnce && (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                fontFamily: MONO,
                color: usedLLM ? '#0E7490' : '#9CA3AF',
                background: usedLLM ? '#0E749014' : 'rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {usedLLM ? 'LIVE AI' : 'SIMULATED'}
            </span>
          )}
          <button
            type="button"
            onClick={run}
            disabled={phase === 'running'}
            className="rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{
              fontFamily: SANS,
              color: '#fff',
              background: phase === 'running' ? '#C4B5FD' : ACCENT,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              cursor: phase === 'running' ? 'default' : 'pointer',
            }}
          >
            {phase === 'running' ? '● Negotiating…' : '↻ Replay negotiation'}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <IdleHero onRun={run} onSkip={reveal} />
          </motion.div>
        )}

        {phase === 'running' && loading && (
          <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <Loader />
          </motion.div>
        )}

        {phase === 'running' && !loading && transcript.length > 0 && (
          <motion.div key="theater" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <NegotiationTheater transcript={transcript} onDone={reveal} />
          </motion.div>
        )}

        {phase === 'revealed' && (
          <motion.div key="rev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <LensView deal={deal} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IdleHero({ onRun, onSkip }: { onRun: () => void; onSkip: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <div className="flex items-center justify-center gap-2 text-[12px]" style={{ fontFamily: MONO }}>
        <span style={{ color: ACCENT, fontWeight: 600 }}>TACIT</span>
        <span style={{ color: '#D1D5DB' }}>/</span>
        <span style={{ color: '#9CA3AF' }}>LEDGER LENS</span>
      </div>
      <h1 className="mt-4 text-[34px] font-bold leading-tight" style={{ color: INK }}>
        Watch three AI agents
        <br />
        negotiate a private deal.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed" style={{ color: '#6B7280' }}>
        A buyer agent posts a need. Three providers bid — sealed. Then see exactly what each party
        can, and cannot, see on Canton.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onRun}
          className="rounded-full px-6 py-3 text-[15px] font-semibold"
          style={{ fontFamily: SANS, color: '#fff', background: ACCENT, boxShadow: '0 6px 20px -8px rgba(124,58,237,0.6)' }}
        >
          ▶ Run live negotiation
        </button>
        <button type="button" onClick={onSkip} className="text-[14px] font-medium" style={{ color: '#6B7280', fontFamily: SANS }}>
          or skip to the ledger →
        </button>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-28 text-center">
      <motion.div
        className="mx-auto h-3 w-3 rounded-full"
        style={{ background: ACCENT }}
        animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <p className="mt-4 text-[14px]" style={{ color: '#6B7280', fontFamily: SANS }}>
        Spinning up agents…
      </p>
    </div>
  );
}
