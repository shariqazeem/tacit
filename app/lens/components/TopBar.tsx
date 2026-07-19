'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C, FONT, glassBlur } from './theme';
import { SourceBadge } from './SourceBadge';

const NAV = [
  { href: '/wallet', label: 'Wallet' },
  { href: '/work', label: 'Work' },
  { href: '/market', label: 'Market' },
  { href: '/lens', label: 'Lens' },
] as const;

/**
 * Unified chrome across every product surface: display-face wordmark left; nav
 * (Work · Market · Lens) + a live readiness dot right. Transparent over the hero,
 * gaining one frosted layer + hairline once scrolled. Chrome only — the readiness
 * dot reads the existing health endpoint; no other data/visibility logic.
 *
 * `right` overrides the nav (landing CTA); `showControls` appends the /lens replay.
 */
export function TopBar({
  source = null,
  showControls = false,
  running = false,
  onReplay,
  right,
  wordmarkHref = '/',
}: {
  source?: 'ledger' | 'memory' | null;
  showControls?: boolean;
  running?: boolean;
  onReplay?: () => void;
  right?: ReactNode;
  wordmarkHref?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

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
        {/* Wordmark (display face) */}
        <Link href={wordmarkHref} className="flex items-baseline gap-1 no-underline" aria-label="tacit — home">
          <span style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1 }}>tacit</span>
          <span className="mb-0.5 inline-block h-[5px] w-[5px] rounded-full" style={{ background: C.violet }} aria-hidden />
        </Link>

        {right ? (
          right
        ) : (
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
            {NAV.map((n) => {
              const active = pathname === n.href || !!pathname?.startsWith(n.href + '/');
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className="rounded-full px-3 py-1.5 no-underline"
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? C.ink : C.ink2,
                    background: active ? 'rgba(10,10,11,0.05)' : 'transparent',
                    transition: 'color 0.18s var(--micro-ease), background 0.18s var(--micro-ease)',
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
            <span className="mx-0.5 hidden h-4 w-px sm:inline-block" style={{ background: C.hairline }} aria-hidden />
            <ReadinessDot />
            {showControls && (
              <span className="tacit-glass ml-1 flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1" style={{ ...glassBlur, boxShadow: '0 1px 2px rgba(10,10,11,0.04)' }}>
                {source && <SourceBadge source={source} />}
                <button
                  type="button"
                  onClick={onReplay}
                  disabled={running}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                  style={{ fontFamily: FONT.sans, color: running ? C.ink3 : C.ink, background: 'rgba(10,10,11,0.04)', cursor: running ? 'default' : 'pointer' }}
                >
                  {running ? '● Replaying…' : '↻ Replay'}
                </button>
              </span>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

/** A small live dot fed by the existing /api/work/health endpoint. Fail-silent. */
function ReadinessDot() {
  const [state, setState] = useState<'unknown' | 'live' | 'degraded' | 'offline'>('unknown');
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/work/health', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        setState(j?.ok === true ? 'live' : j?.ledgerReachable ? 'degraded' : 'offline');
      } catch {
        if (alive) setState('offline');
      }
    };
    check();
    const id = setInterval(() => { if (!document.hidden) check(); }, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const color = state === 'live' ? C.live : state === 'degraded' ? C.fallback : C.ink3;
  const label = state === 'live' ? 'live · devnet' : state === 'degraded' ? 'degraded' : state === 'offline' ? 'offline' : 'checking';
  return (
    <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 sm:inline-flex" style={{ background: 'rgba(10,10,11,0.03)', border: `1px solid ${C.hairline}` }} title={`Canton readiness: ${label}`} aria-live="polite">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${state === 'live' ? 'tacit-pulse' : ''}`} style={{ background: color }} aria-hidden />
      <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.ink2, letterSpacing: '0.02em' }}>{label}</span>
    </span>
  );
}
