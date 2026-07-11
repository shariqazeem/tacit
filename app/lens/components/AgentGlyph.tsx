'use client';

import { C } from './theme';

export type GlyphId = 'buyer' | 'A' | 'B' | 'C' | 'system';

/** Buyer is violet-tinted; providers neutral; Tacit/system inky. */
function tint(id: GlyphId): { bg: string; fg: string; ring: string } {
  if (id === 'buyer') return { bg: C.violetSoft, fg: C.violet, ring: 'rgba(124,58,237,0.22)' };
  if (id === 'system') return { bg: 'rgba(10,10,11,0.06)', fg: C.ink, ring: 'rgba(10,10,11,0.14)' };
  return { bg: 'rgba(10,10,11,0.04)', fg: 'rgba(10,10,11,0.66)', ring: 'rgba(10,10,11,0.12)' };
}

/** A unique minimal geometric mark per identity — no emoji. */
function Mark({ id, color }: { id: GlyphId; color: string }) {
  switch (id) {
    case 'buyer': // concentric focus ring — the observer
      return (
        <>
          <circle cx="12" cy="12" r="6.5" stroke={color} strokeWidth="1.6" fill="none" />
          <circle cx="12" cy="12" r="2.2" fill={color} />
        </>
      );
    case 'A': // triangle
      return <path d="M12 6.5 L17.5 16.5 H6.5 Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" fill="none" />;
    case 'B': // stacked bars
      return (
        <>
          <line x1="7" y1="9.5" x2="17" y2="9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="7" y1="12.5" x2="17" y2="12.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="7" y1="15.5" x2="13" y2="15.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'C': // diamond
      return <path d="M12 6 L18 12 L12 18 L6 12 Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" fill="none" />;
    case 'system': // node cross
      return (
        <>
          <line x1="12" y1="6.5" x2="12" y2="17.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="6.5" y1="12" x2="17.5" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </>
      );
  }
}

export function AgentGlyph({ id, size = 28 }: { id: GlyphId; size?: number }) {
  const t = tint(id);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: t.bg,
        border: `1px solid ${t.ring}`,
      }}
      aria-hidden
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24" fill="none">
        <Mark id={id} color={t.fg} />
      </svg>
    </span>
  );
}

/** Tiny persona dot for the segmented control. */
export function PersonaDot({ id }: { id: GlyphId }) {
  const t = tint(id);
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: id === 'buyer' ? C.violet : t.fg }}
      aria-hidden
    />
  );
}
