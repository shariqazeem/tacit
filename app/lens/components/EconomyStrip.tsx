'use client';

import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { C, FONT } from './theme';
import { AgentGlyph, type GlyphId } from './AgentGlyph';

interface ProviderEconomy { id: string; label: string; earnings: number; deals: number }
interface SettlementRow { rfsId: string; title: string; category: string; winner: string; price: number; paid: { amount: number; currency: string } | null; contractId: string }
interface Economy {
  available: boolean;
  ledgerUrl: string;
  currency: string;
  totals: { deals: number; moved: number };
  providers: ProviderEconomy[];
  recent: SettlementRow[];
  updatedAt: string;
}

const glyphOf = (id: string): GlyphId => (id === 'providerA' ? 'A' : id === 'providerB' ? 'B' : id === 'providerC' ? 'C' : 'system');

/**
 * THE LEDGER ECONOMY — every number derived live from Canton at fetch time
 * (never cached/invented). Refetches whenever `refreshKey` changes (i.e. after a
 * new negotiation), so the winning provider's wealth visibly ticks up. Renders
 * nothing when the ledger is unreachable — the section simply isn't there.
 */
export function EconomyStrip({ refreshKey }: { refreshKey: number }) {
  const [eco, setEco] = useState<Economy | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/economy', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEco(d?.available ? d : null);
      })
      .catch(() => {
        if (!cancelled) setEco(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!eco) return null;

  const stamp = (() => {
    try {
      return new Date(eco.updatedAt).toLocaleTimeString();
    } catch {
      return eco.updatedAt;
    }
  })();

  return (
    <div className="mx-auto mt-10 max-w-4xl px-6">
      <div className="border-t pt-8" style={{ borderColor: C.hairline }}>
        <div className="mb-5 flex items-center gap-2">
          <span className="tacit-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.ink2, fontFamily: FONT.mono }}>
            The Ledger Economy
          </span>
          <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.live, fontFamily: FONT.mono }}>
            · live
          </span>
        </div>

        {/* Provider wealth */}
        <div className="grid gap-3 sm:grid-cols-3">
          {eco.providers.map((p) => (
            <div key={p.id} className="tacit-card flex items-center gap-3 p-4">
              <AgentGlyph id={glyphOf(p.id)} size={30} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>
                  {p.label}
                </div>
                <div className="flex items-baseline gap-2">
                  <Money id={p.id} to={p.earnings} />
                  <span className="text-[11px]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
                    {p.deals} won
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent settlements */}
        {eco.recent.length > 0 && (
          <div className="tacit-card mt-3 p-4">
            <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
              Recent settlements
            </div>
            <div className="flex flex-col">
              {eco.recent.map((r, i) => (
                <SettlementRowView key={r.contractId} row={r} first={i === 0} />
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
          Derived from live Canton queries · {eco.totals.deals} deals · {eco.totals.moved} {eco.currency} moved · refresh: {stamp}
        </p>
      </div>
    </div>
  );
}

function SettlementRowView({ row, first }: { row: SettlementRow; first: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.contractId);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy settlement contract ${row.contractId}`}
      className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 text-left text-[12px]"
      style={{ borderTop: first ? 'none' : `1px solid ${C.hairline}`, fontFamily: FONT.mono, cursor: 'pointer' }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate" style={{ color: C.ink2 }}>{row.title || row.winner}</span>
        {row.category && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em]" style={{ color: C.ink3, background: 'rgba(10,10,11,0.05)' }}>
            {row.category}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span style={{ color: C.ink3 }}>{row.winner}</span>
        <span className="tabular-nums" style={{ color: C.ink, fontWeight: 600 }}>${row.price}</span>
        <span style={{ color: copied ? C.live : C.ink3 }}>{copied ? '✓' : 'copy'}</span>
      </span>
    </button>
  );
}

// Persist each provider's last-shown earnings across the strip's remounts, so a
// replay counts from the OLD value → NEW (the wealth ticks up), never blanking to 0.
const moneyCache = new Map<string, number>();

function Money({ id, to }: { id: string; to: number }) {
  const reduce = useReducedMotion();
  const start = moneyCache.get(id) ?? 0;
  const [val, setVal] = useState(reduce ? to : start);
  useEffect(() => {
    if (reduce) {
      setVal(to);
      moneyCache.set(id, to);
      return;
    }
    const from = moneyCache.get(id) ?? 0;
    const controls = animate(from, to, { duration: 0.8, ease: 'easeOut', onUpdate: setVal });
    moneyCache.set(id, to);
    return () => controls.stop();
  }, [id, to, reduce]);
  return (
    <span className="tacit-num text-[16px] font-semibold" style={{ color: C.ink }}>
      ${Math.round(val)}
    </span>
  );
}
