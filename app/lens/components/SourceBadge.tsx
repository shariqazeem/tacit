'use client';

import { useEffect, useState } from 'react';
import { C, FONT, glassBlur } from './theme';

type Source = 'ledger' | 'memory';
type Mode = 'sandbox' | 'canton3-local' | 'devnet';

interface State {
  label: string;
  color: string;
  tip: string;
  pulse: boolean;
  /** The devnet-only network chip text, shown next to the badge. */
  network?: string;
}

// The honest label is a function of BOTH the per-deal source (did it really
// round-trip the ledger?) AND the configured mode (which ledger). A fallback
// deal is DEMO FALLBACK even in devnet mode — nothing here is ever overclaimed.
function resolve(source: Source, mode: Mode | null): State {
  if (source === 'memory') {
    return {
      label: 'DEMO FALLBACK',
      color: C.fallback,
      tip: 'Canton ledger unreachable — deterministic in-memory simulation. Nothing here is on a live ledger.',
      pulse: false,
    };
  }
  if (mode === 'devnet') {
    return {
      label: 'ON CANTON DEVNET',
      color: C.live,
      tip: 'Live on the Canton devnet (the shared Global Synchronizer). This deal round-tripped a real participant — the contract ids are verifiable on-network.',
      pulse: true,
      network: 'Global Synchronizer',
    };
  }
  if (mode === 'canton3-local') {
    return {
      label: 'ON CANTON · LOCAL',
      color: C.live,
      tip: 'Live on a local Canton 3.x participant via the v2 JSON Ledger API — the exact code path used for devnet. Visibility is enforced by the ledger.',
      pulse: true,
    };
  }
  return {
    label: 'ON CANTON',
    color: C.live,
    tip: 'This deal was written to and read back from the live Canton ledger. Visibility is enforced by the ledger.',
    pulse: true,
  };
}

/**
 * The honesty signal. Three truthful states — ON CANTON DEVNET / ON CANTON
 * (·LOCAL / plain) / DEMO FALLBACK — driven by the per-deal `source` plus the
 * configured mode (read once from /api/health). The labeling is load-bearing;
 * it must never overclaim (a fallback deal is never shown as on-ledger).
 */
export function SourceBadge({ source }: { source: Source }) {
  const [hover, setHover] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.canton?.mode) setMode(d.canton.mode as Mode);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const s = resolve(source, mode);

  return (
    <span
      className="relative inline-flex items-center gap-2 rounded-full px-2.5 py-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
      aria-label={`${s.label}. ${s.tip}`}
      style={{ outline: 'none' }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.pulse ? 'tacit-pulse' : ''}`}
        style={{ background: s.color }}
        aria-hidden
      />
      <span className="text-[10.5px] font-semibold tracking-[0.1em]" style={{ color: s.color, fontFamily: FONT.mono }}>
        {s.label}
      </span>

      {/* Devnet-only network chip — extra proof, hidden on narrow screens. */}
      {s.network && (
        <span
          className="ml-0.5 hidden items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.06em] sm:inline-flex"
          style={{ color: C.ink3, background: 'rgba(10,10,11,0.05)', fontFamily: FONT.mono }}
        >
          {s.network}
        </span>
      )}

      {hover && (
        <span
          role="tooltip"
          className="tacit-glass absolute right-0 top-[calc(100%+8px)] z-50 w-[248px] rounded-xl px-3 py-2.5 text-left text-[12px] leading-snug"
          style={{ ...glassBlur, color: C.ink2, fontFamily: FONT.sans, boxShadow: 'var(--shadow-card)' }}
        >
          {s.tip}
        </span>
      )}
    </span>
  );
}
