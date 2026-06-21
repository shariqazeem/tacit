'use client';

import { motion } from 'framer-motion';
import { Persona, PersonaMeta } from '../types';

const ACCENT = '#7C3AED';
const SANS = "'Inter', sans-serif";

export function PersonaSwitcher({
  personas,
  active,
  onChange,
}: {
  personas: PersonaMeta[];
  active: Persona;
  onChange: (p: Persona) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-full p-1"
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {personas.map((p) => {
        const isActive = p.id === active;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className="relative rounded-full px-4 py-2 text-[13px] font-medium transition-colors"
            style={{ color: isActive ? '#FFFFFF' : '#6B7280', fontFamily: SANS }}
          >
            {isActive && (
              <motion.span
                layoutId="persona-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: ACCENT }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
