'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Deal } from '../types';
import { C, FONT } from './theme';
import { LensView } from './LensView';
import { NegotiationTheater } from './NegotiationTheater';
import { IdleHero } from './IdleHero';
import { TopBar } from './TopBar';
import { AmbientBackground } from './AmbientBackground';
import { EconomyStrip } from './EconomyStrip';
import type { Step } from '../agents/negotiation';

type Phase = 'idle' | 'running' | 'revealed';

/**
 * The /lens experience: idle hero → live negotiation theater → Lens reveal.
 * Fetches a real deal from /api/negotiate and feeds it to LensView. Falls back
 * to the seed deal (clearly labeled DEMO FALLBACK) if the engine is unreachable,
 * so the demo never dead-ends. Presentation only — no data/visibility logic.
 */
export function LensExperience({ seedDeal }: { seedDeal: Deal }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [deal, setDeal] = useState<Deal>(seedDeal);
  const [transcript, setTranscript] = useState<Step[]>([]);
  const [source, setSource] = useState<'ledger' | 'memory' | null>(null);
  const [ranOnce, setRanOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usedLLM, setUsedLLM] = useState(false);
  const [runCount, setRunCount] = useState(0);

  const reveal = useCallback(() => setPhase('revealed'), []);

  const run = useCallback(async () => {
    setPhase('running');
    setLoading(true);
    setTranscript([]);
    setSource(null);
    setUsedLLM(false);
    setRanOnce(true);
    try {
      const res = await fetch('/api/negotiate', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setDeal(data.deal);
      setSource(data.dealSource === 'ledger' ? 'ledger' : 'memory');
      setUsedLLM(!!data.usedLLM);
      setRunCount((c) => c + 1); // refreshes the economy strip with the new deal
      const t: Step[] = Array.isArray(data.transcript) ? data.transcript : [];
      setTranscript(t);
      setLoading(false);
      if (t.length === 0) setPhase('revealed');
    } catch {
      // Engine unreachable → reveal the seed deal as a clearly-labeled fallback.
      setDeal(seedDeal);
      setSource('memory');
      setLoading(false);
      setPhase('revealed');
    }
  }, [seedDeal]);

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <TopBar source={source} showControls={ranOnce} running={phase === 'running'} onReplay={run} />

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
            <NegotiationTheater
              transcript={transcript}
              onDone={reveal}
              usedLLM={usedLLM}
              // The theater's count-up is the operator/director view; it only ever
              // fires for a real ledger deal (never in fallback), so it can never
              // claim value moved when it didn't.
              paidAmount={source === 'ledger' ? deal.settlement.payment?.amount.value : undefined}
              paidCurrency={source === 'ledger' ? deal.settlement.payment?.currency.value : undefined}
            />
          </motion.div>
        )}

        {phase === 'revealed' && (
          <motion.div key="rev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <LensView deal={deal} source={source} />
            {/* The live ledger economy — only under a real on-ledger deal. Self-
                hides if the ledger is unreachable, so it never fabricates stats. */}
            {source === 'ledger' && <EconomyStrip refreshKey={runCount} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader() {
  return (
    <section className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden" style={{ background: C.bg }}>
      <AmbientBackground />
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: C.violet }}
          animate={{ opacity: [1, 0.3, 1], scale: [1, 0.7, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        />
        <p className="mt-4 text-[15px]" style={{ color: C.ink2, fontFamily: FONT.sans }}>
          Convening agents…
        </p>
      </div>
    </section>
  );
}
