'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Field, Persona, isVisible } from '../types';
import { C, FONT, microEase } from './theme';

interface RevealFieldProps<T> {
  label: string;
  field: Field<T>;
  persona: Persona;
  mono?: boolean;
  format?: (v: T) => string;
}

/**
 * Renders one field, revealed or redacted — decided ONLY by `isVisible`.
 * Reveal = crisp value (blur→sharp). Redact = frosted PRIVATE pill with a lock.
 * The visibility decision is never made here; it comes from the field itself.
 */
export function RevealField<T>({ label, field, persona, mono = false, format }: RevealFieldProps<T>) {
  const visible = isVisible(field, persona);
  const text = format ? format(field.value) : String(field.value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="tacit-label">{label}</span>
      <div className="relative flex h-8 items-center">
        <AnimatePresence initial={false} mode="wait">
          {visible ? (
            <motion.span
              key="visible"
              initial={{ filter: 'blur(8px)', opacity: 0 }}
              animate={{ filter: 'blur(0px)', opacity: 1 }}
              exit={{ filter: 'blur(8px)', opacity: 0 }}
              transition={{ duration: 0.25, ease: microEase }}
              className="text-[15px] font-medium"
              style={{ color: C.ink, fontFamily: mono ? FONT.mono : FONT.sans, ...(mono ? { fontVariantNumeric: 'tabular-nums' } : {}) }}
            >
              {text}
            </motion.span>
          ) : (
            <motion.span
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: microEase }}
              className="inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                color: C.ink3,
                background: 'rgba(10,10,11,0.04)',
                border: `1px solid ${C.hairline}`,
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                fontFamily: FONT.mono,
                letterSpacing: '0.06em',
              }}
            >
              <LockGlyph />
              PRIVATE
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" fill="currentColor" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
