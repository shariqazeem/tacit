'use client';

import { useState, type ReactNode } from 'react';
import { C, FONT } from '../../lens/components/theme';

/** Truncated, copyable contract id. Clipboard API may be blocked on http:// —
 *  so we fall back to selecting the full value, and it is always selectable. */
export function CopyId({ id, label }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 12 }}>—</span>;
  const short = id.length > 20 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // http:// origin: clipboard blocked — select the hidden full value instead.
      const el = document.getElementById(`cid-${id}`);
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      {label && <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11 }}>{label}</span>}
      <button
        type="button"
        onClick={copy}
        title={`Copy ${id}`}
        aria-label={`Copy contract id ${id}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
        style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ink2, background: C.violetSoft, border: `1px solid ${C.hairline}`, cursor: 'pointer' }}
      >
        <span aria-hidden>{short}</span>
        <span aria-hidden style={{ fontSize: 10, color: copied ? C.live : C.ink3 }}>{copied ? '✓' : '⧉'}</span>
      </button>
      {/* Selectable full value for the http:// fallback (visually hidden but selectable). */}
      <span id={`cid-${id}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{id}</span>
    </span>
  );
}

/** A crisp-or-frosted field cell for the Work Privacy Lens. */
export function LensCell({ visible, children }: { visible: boolean; children: ReactNode }) {
  if (visible) return <span style={{ color: C.ink, fontFamily: FONT.mono, fontSize: 13 }}>{children}</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{ background: 'rgba(10,10,11,0.04)', color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.08em', filter: 'blur(0.15px)' }}
      aria-label="private — not visible to this party"
    >
      <span aria-hidden>🔒</span> PRIVATE
    </span>
  );
}

export function StatChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'live' | 'warn' }) {
  const color = tone === 'live' ? C.live : tone === 'warn' ? C.fallback : C.ink2;
  const dot = tone === 'live' ? C.live : tone === 'warn' ? C.fallback : C.ink3;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: C.surface, border: `1px solid ${C.hairline}`, color, fontFamily: FONT.sans, fontSize: 12, fontWeight: 500 }}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

/** Label / value row used across the success surface. Value wraps safely. */
export function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: `1px solid ${C.hairline}` }}>
      <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5, flex: '0 0 auto' }}>{label}</span>
      <span
        className="text-right"
        style={{ color: C.ink, fontFamily: mono ? FONT.mono : FONT.sans, fontSize: 13, wordBreak: 'break-word', minWidth: 0 }}
      >
        {children}
      </span>
    </div>
  );
}

export function SectionTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="mb-3">
      {kicker && (
        <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{kicker}</div>
      )}
      <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{children}</div>
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      className="rounded-2xl p-5 sm:p-6"
      style={{ background: C.surface, border: `1px solid ${C.hairline}`, boxShadow: '0 1px 2px rgba(10,10,11,0.03)', ...style }}
    >
      {children}
    </section>
  );
}
