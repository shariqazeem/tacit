'use client';

import { useReducedMotion, motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { C, FONT, refocusIn, refocusOut } from '../../lens/components/theme';
import { LensCell } from './bits';
import { PERSONA_META, type Persona, type WorkResult } from '../types';

const ORDER: Persona[] = ['buyer', 'providerA', 'providerB', 'providerC', 'auditor'];

/**
 * The Work Privacy Lens — the same completed job seen from each party, with
 * every crisp/frosted cell driven by the RETURNED per-persona ledger snapshot
 * (never hardcoded). Switching to Auditor frosts the report while the receipt
 * stays crisp — the core demonstration.
 */
export function WorkLens({ result }: { result: WorkResult }) {
  const reduce = useReducedMotion();
  const [persona, setPersona] = useState<Persona>('auditor');
  const vis = result.visibility;
  if (!vis.available) return null;

  const bidRows = result.bids.map((b) => ({
    key: b.contractId,
    label: `${PERSONA_META[b.providerLabel]?.label ?? b.providerLabel} sealed price`,
    value: `${b.price.toFixed(2)} USD.demo`,
    visibleTo: (p: Persona) => (vis.bids[p] || []).includes(b.contractId),
  }));

  const rows = [
    { key: 'req', label: 'Work request (URL, budget)', value: result.input.url, visibleTo: (p: Persona) => !!vis.activeWorkRequest[p] },
    ...bidRows,
    { key: 'settle', label: 'Winner & amount', value: `${PERSONA_META[result.winner.providerLabel]?.label ?? result.winner.providerLabel} · ${result.amount.toFixed(2)} USD.demo`, visibleTo: (p: Persona) => !!vis.settlement[p] },
    { key: 'report', label: 'Private report body', value: result.artifact.report ? `site_audit · score ${result.artifact.report.score}` : 'delivered report', visibleTo: (p: Persona) => !!vis.privateDelivery[p] },
    { key: 'receipt', label: 'Delivery receipt (SHA-256)', value: `${result.artifact.sha256.slice(0, 12)}…`, visibleTo: (p: Persona) => !!vis.receipt[p] },
  ];

  return (
    <div>
      {/* persona switcher */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="View as party">
        {ORDER.map((p) => {
          const active = p === persona;
          const m = PERSONA_META[p];
          return (
            <button
              key={p}
              role="tab"
              aria-selected={active}
              onClick={() => setPersona(p)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                color: active ? '#fff' : C.ink2,
                background: active ? C.ink : C.surface,
                border: `1px solid ${active ? C.ink : C.hairline}`,
                transition: 'background 0.2s, color 0.2s, border-color 0.2s',
              }}
            >
              <span aria-hidden style={{ color: active ? '#fff' : C.violet }}>{m.glyph}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.hairline}` }}>
        <div className="mb-3 flex items-baseline justify-between">
          <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600 }}>
            Viewing as {PERSONA_META[persona].label}
          </span>
          <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 11.5 }}>{PERSONA_META[persona].role}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={persona}
            initial={reduce ? false : { opacity: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            transition={reduce ? { duration: 0.12 } : { ...refocusIn }}
          >
            {rows.map((r) => {
              const visible = r.visibleTo(persona);
              return (
                <div key={r.key} className="flex items-center justify-between gap-4 py-2.5" style={{ borderBottom: `1px solid ${C.hairline}` }}>
                  <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>{r.label}</span>
                  <span className="text-right" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                    <LensCell visible={visible}>{r.value}</LensCell>
                  </span>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.5 }}>
          Same job. Different truth—enforced by Canton. Every cell above is a real per-party ledger read,
          not a hardcoded rule.
          {persona === 'auditor' && (
            <span style={{ color: C.ink }}> The Auditor holds the receipt commitment but never the report body.</span>
          )}
        </p>
      </div>
    </div>
  );
}
