'use client';

import { motion } from 'framer-motion';
import { Persona, PersonaMeta } from '../types';
import { C, FONT, glassBlur, springLayout } from './theme';
import { GlyphId } from './AgentGlyph';

const AUDITOR_SLATE = '#64748B';

const DOT: Record<Persona, GlyphId | 'public'> = {
  public: 'public',
  buyer: 'buyer',
  providerA: 'A',
  providerB: 'B',
  providerC: 'C',
  auditor: 'system',
};

function dotColor(p: Persona, active: boolean): string {
  if (active) return '#FFFFFF';
  if (p === 'buyer') return C.violet;
  if (p === 'auditor') return AUDITOR_SLATE; // institutional, not violet
  if (p === 'public') return C.ink3;
  return 'rgba(10,10,11,0.5)';
}

/**
 * Glass segmented control. The active pill is a shared-layout element so it
 * springs between options. Arrow keys move the selection (roving focus);
 * selection drives the Lens, never the other way around.
 */
export function PersonaSwitcher({
  personas,
  active,
  onChange,
}: {
  personas: PersonaMeta[];
  active: Persona;
  onChange: (p: Persona) => void;
}) {
  const idx = personas.findIndex((p) => p.id === active);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = (idx + delta + personas.length) % personas.length;
    onChange(personas[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label="Choose a perspective"
      onKeyDown={onKey}
      className="tacit-glass inline-flex flex-wrap gap-1 rounded-full p-1"
      style={{ ...glassBlur, boxShadow: '0 1px 2px rgba(10,10,11,0.04)' }}
    >
      {personas.map((p) => {
        const isActive = p.id === active;
        const hollow = DOT[p.id] === 'public';
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            type="button"
            onClick={() => onChange(p.id)}
            className="relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
            style={{ color: isActive ? '#FFFFFF' : C.ink2, fontFamily: FONT.sans, transition: 'color 0.2s var(--micro-ease)' }}
          >
            {isActive && (
              <motion.span
                layoutId="persona-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: C.violet }}
                transition={springLayout}
              />
            )}
            <span
              className="relative z-10 inline-block h-2 w-2 rounded-full"
              style={
                hollow
                  ? { border: `1.5px solid ${dotColor(p.id, isActive)}`, background: 'transparent' }
                  : { background: dotColor(p.id, isActive) }
              }
              aria-hidden
            />
            <span className="relative z-10 whitespace-nowrap">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
