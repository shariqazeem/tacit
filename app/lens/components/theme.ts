// Tacit — shared presentational tokens.
//
// Single source of truth for colors, fonts, and motion so no component
// invents ad-hoc values. Mirrors the CSS custom properties in globals.css.
// Presentational only — imports nothing from the ledger/agents layers.

import type { CSSProperties } from 'react';
import type { Transition, Variants } from 'framer-motion';

export const C = {
  bg: '#FAFAF9',
  surface: '#FFFFFF',
  ink: '#0A0A0B',
  ink2: 'rgba(10,10,11,0.62)',
  ink3: 'rgba(10,10,11,0.38)',
  hairline: 'rgba(10,10,11,0.06)',
  violet: '#7C3AED',
  violetSoft: 'rgba(124,58,237,0.08)',
  live: '#0D9488',
  fallback: '#B45309',
} as const;

export const FONT = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

/**
 * Frosted-glass blur applied inline. Tailwind v4's Lightning CSS strips the
 * unprefixed `backdrop-filter` from stylesheet rules (keeping only the -webkit-
 * one, which Firefox ignores), so the blur must ride on the inline style prop.
 * Pair with the `.tacit-glass` class, which supplies the translucent bg + hairline.
 */
export const glassBlur: CSSProperties = {
  backdropFilter: 'blur(20px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
};

// ── Motion tokens ─────────────────────────────────────────────
export const springLayout: Transition = { type: 'spring', stiffness: 260, damping: 30 };
export const microEase: [number, number, number, number] = [0.32, 0.72, 0, 1];
export const micro: Transition = { duration: 0.18, ease: microEase };
export const STAGGER = 0.06;

/** Refocus (persona pull-focus): the outgoing blur is ~40% faster than the
 *  incoming sharpen, so attention snaps to the new view — the same asymmetry a
 *  camera uses. Used for every persona switch. */
export const refocusIn: Transition = { duration: 0.26, ease: microEase };
export const refocusOut: Transition = { duration: 0.15, ease: microEase };

/** The settlement lands with a soft spring (a ~2px settle-bounce) — the end of
 *  the award beat. Distinct from springLayout so the "arrival" reads. */
export const settle: Transition = { type: 'spring', stiffness: 300, damping: 22, mass: 0.9 };

/** Staggered "masked rise" for hero content and card groups. */
export const riseContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.05 } },
};

export const riseItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: microEase } },
};
