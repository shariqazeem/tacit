'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Field, Persona, isVisible } from '../types';

const ACCENT = '#7C3AED';
const INK = '#0A0A0B';
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', sans-serif";

interface RevealFieldProps<T> {
  label: string;
  field: Field<T>;
  persona: Persona;
  mono?: boolean;
  format?: (v: T) => string;
}

/**
 * Renders one field, revealed or redacted, decided ONLY by `isVisible`.
 * Reveal = blur→sharp with a brief violet underline flash.
 * Redact = frosted "PRIVATE" pill with a lock glyph.
 */
export function RevealField<T>({ label, field, persona, mono = false, format }: RevealFieldProps<T>) {
  const visible = isVisible(field, persona);
  const text = format ? format(field.value) : String(field.value);

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[11px] uppercase tracking-[0.14em]"
        style={{ color: '#9CA3AF', fontFamily: SANS }}
      >
        {label}
      </span>

      <div className="relative h-9">
        <AnimatePresence initial={false}>
          {visible ? (
            <motion.div
              key="visible"
              initial={{ filter: 'blur(8px)', opacity: 0 }}
              animate={{ filter: 'blur(0px)', opacity: 1 }}
              exit={{ filter: 'blur(8px)', opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 flex items-center"
            >
              <span
                className="relative text-[15px] font-medium"
                style={{ color: INK, fontFamily: mono ? MONO : SANS }}
              >
                {text}
                <motion.span
                  aria-hidden
                  initial={{ scaleX: 1, opacity: 0.9 }}
                  animate={{ scaleX: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="absolute -bottom-1 left-0 h-[2px] w-full origin-left rounded-full"
                  style={{ background: ACCENT }}
                />
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 flex items-center"
            >
              <span
                className="inline-flex select-none items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium"
                style={{
                  color: '#6B7280',
                  background: 'rgba(10,10,11,0.045)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  fontFamily: MONO,
                }}
              >
                <LockGlyph />
                PRIVATE
                <span aria-hidden style={{ color: '#D1D5DB', letterSpacing: '0.18em' }}>
                  ▮▮▮
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" fill="#9CA3AF" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#9CA3AF" strokeWidth="2" />
    </svg>
  );
}
