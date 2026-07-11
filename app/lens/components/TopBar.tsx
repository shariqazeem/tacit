'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { C, FONT, glassBlur } from './theme';
import { SourceBadge } from './SourceBadge';

/**
 * Minimal fixed chrome. Wordmark left; the right side is either the /lens
 * controls (source badge + Replay) or a caller-supplied `right` slot (used by
 * the landing page for "Open the Lens →"). Transparent over the hero, gaining
 * glass + hairline once scrolled. Chrome only — no data/visibility logic.
 */
export function TopBar({
  source = null,
  showControls = false,
  running = false,
  onReplay,
  right,
  wordmarkHref = '/lens',
}: {
  source?: 'ledger' | 'memory' | null;
  showControls?: boolean;
  running?: boolean;
  onReplay?: () => void;
  /** Optional right-side content; when set, it replaces the /lens controls. */
  right?: ReactNode;
  wordmarkHref?: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50"
      style={{
        transition: 'background 0.3s var(--micro-ease), box-shadow 0.3s var(--micro-ease), border-color 0.3s var(--micro-ease)',
        background: scrolled ? 'rgba(250,250,249,0.72)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(1.4)' : 'none',
        borderBottom: `1px solid ${scrolled ? C.hairline : 'transparent'}`,
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        {/* Wordmark */}
        <a
          href={wordmarkHref}
          className="flex items-baseline gap-1 no-underline"
          style={{ fontFamily: FONT.sans }}
          aria-label="tacit — home"
        >
          <span
            className="text-[16px] font-semibold lowercase"
            style={{ color: C.ink, letterSpacing: '-0.02em' }}
          >
            tacit
          </span>
          <span
            className="mb-0.5 inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: C.violet }}
            aria-hidden
          />
        </a>

        {/* Right slot (landing) takes precedence over the /lens controls. */}
        {right}

        {/* Controls */}
        {!right && showControls && (
          <div
            className="tacit-glass flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1"
            style={{ ...glassBlur, boxShadow: '0 1px 2px rgba(10,10,11,0.04)' }}
          >
            {source && <SourceBadge source={source} />}
            <button
              type="button"
              onClick={onReplay}
              disabled={running}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{
                fontFamily: FONT.sans,
                color: running ? C.ink3 : C.ink,
                background: 'rgba(10,10,11,0.04)',
                cursor: running ? 'default' : 'pointer',
                transition: 'background 0.18s var(--micro-ease), color 0.18s var(--micro-ease)',
              }}
              onMouseEnter={(e) => {
                if (!running) e.currentTarget.style.background = 'rgba(10,10,11,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(10,10,11,0.04)';
              }}
            >
              {running ? '● Negotiating…' : '↻ Replay'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
