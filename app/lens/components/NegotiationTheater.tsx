'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Step } from '../agents/negotiation';

const ACCENT = '#7C3AED';
const INK = '#0A0A0B';
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', sans-serif";

function chipColor(actor: string): string {
  if (actor.toLowerCase().startsWith('buyer')) return ACCENT;
  if (actor === 'Tacit') return INK;
  return '#0E7490'; // providers
}

/**
 * Plays the negotiation transcript step-by-step, then calls onDone — the
 * buildup before the Lens reveal. `onDone` must be a stable callback.
 */
export function NegotiationTheater({ transcript, onDone }: { transcript: Step[]; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const total = transcript.length;

  useEffect(() => {
    if (total === 0) {
      onDone();
      return;
    }
    const STEP_MS = 850;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < total; i++) {
      timers.push(setTimeout(() => setShown(i + 1), i * STEP_MS));
    }
    timers.push(setTimeout(onDone, total * STEP_MS + 800));
    return () => timers.forEach(clearTimeout);
  }, [transcript, total, onDone]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 flex items-center gap-2">
        <motion.span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: ACCENT }}
          animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        />
        <span className="text-[12px] font-semibold tracking-[0.16em]" style={{ color: ACCENT, fontFamily: MONO }}>
          LIVE NEGOTIATION
        </span>
        <span className="text-[12px]" style={{ color: '#9CA3AF', fontFamily: SANS }}>
          · agents acting autonomously
        </span>
      </div>

      <div
        className="rounded-2xl p-6"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px -12px rgba(0,0,0,0.10)',
        }}
      >
        <div className="flex flex-col gap-3">
          {transcript.slice(0, shown).map((s, i) => {
            const sealed = /sealed/i.test(s.action);
            const c = chipColor(s.actor);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="text-[12px]" style={{ color: '#9CA3AF', fontFamily: MONO, minWidth: 64 }}>
                  {s.t}
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{ color: c, background: `${c}14`, fontFamily: SANS, whiteSpace: 'nowrap' }}
                >
                  {s.actor}
                </span>
                <span className="text-[14px] font-medium" style={{ color: INK, fontFamily: SANS }}>
                  {sealed && (
                    <span aria-hidden style={{ marginRight: 6 }}>
                      🔒
                    </span>
                  )}
                  {s.action}
                </span>
                <span className="text-[13px]" style={{ color: '#9CA3AF', fontFamily: SANS }}>
                  · {s.detail}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 h-1 w-full overflow-hidden rounded-full" style={{ background: '#F0F0EF' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: ACCENT }}
            animate={{ width: `${total ? (shown / total) * 100 : 0}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </div>
  );
}
