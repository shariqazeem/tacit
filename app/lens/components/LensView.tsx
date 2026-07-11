'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Deal, Field, Persona, PERSONAS, isVisible } from '../types';
import { C, FONT, glassBlur, refocusIn, refocusOut } from './theme';
import { PersonaSwitcher } from './PersonaSwitcher';
import { RevealField } from './RevealField';

const usd = (n: number) => `$${n}`;

/** The optional live-ledger payment block (present only on ON-CANTON deals). */
type Payment = NonNullable<Deal['settlement']['payment']>;

export function LensView({ deal, source }: { deal: Deal; source?: 'ledger' | 'memory' | null }) {
  const [persona, setPersona] = useState<Persona>('buyer');
  const active = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];
  const onLedger = source === 'ledger';

  return (
    <div className="min-h-screen w-full" style={{ background: C.bg }}>
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-24">
        {/* Header */}
        <div className="mb-8">
          <span className="tacit-label">The Ledger Lens</span>
          <h1 className="t-h2 mt-2.5" style={{ color: C.ink }}>
            One deal. Five views.
            <br />
            The same ledger.
          </h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed" style={{ color: C.ink2, fontFamily: FONT.sans }}>
            Switch perspective to see exactly what Canton reveals to each party — and what it keeps private.
          </p>
        </div>

        {/* Perspective switcher */}
        <PersonaSwitcher personas={PERSONAS} active={persona} onChange={setPersona} />

        {/* Live caption tied to the active persona */}
        <AnimatePresence mode="wait">
          <motion.div
            key={persona}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: refocusIn }}
            exit={{ opacity: 0, y: -6, transition: refocusOut }}
            className="tacit-card mt-5 px-4 py-3.5 text-[15px] leading-relaxed"
            style={{ color: C.ink2 }}
          >
            <span style={{ color: C.violet, fontWeight: 600 }}>{active.role}.</span>{' '}
            <span style={{ fontFamily: FONT.sans }}>{active.caption}</span>
            {deal.parties?.[persona] && (
              <span className="mt-2.5 flex items-center gap-1.5 text-[11px]" style={{ color: C.ink3, fontFamily: FONT.mono }}>
                <span className="tacit-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.live }} aria-hidden />
                <span className="shrink-0">on Canton as</span>
                <span className="min-w-0 truncate" style={{ color: C.ink2 }} title={deal.parties[persona]}>
                  {deal.parties[persona]}
                </span>
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Deal cards — refocus (blur → sharp) on persona switch */}
        <AnimatePresence mode="wait">
          <motion.div
            key={persona}
            className="mt-6 grid gap-5"
            initial={{ filter: 'blur(8px)', opacity: 0, scale: 0.995 }}
            animate={{ filter: 'blur(0px)', opacity: 1, scale: 1, transition: refocusIn }}
            exit={{ filter: 'blur(8px)', opacity: 0, scale: 0.995, transition: refocusOut }}
          >
            <Card title="The request" subtitle="What the buyer agent is procuring">
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <RevealField label="Deal" field={deal.existence} persona={persona} />
                <RevealField label="Buyer" field={deal.rfs.buyer} persona={persona} />
                <RevealField label="Service" field={deal.rfs.title} persona={persona} />
                <RevealField label="Budget" field={deal.rfs.budget} persona={persona} mono />
              </div>
            </Card>

            <Card title="Sealed bids" subtitle="Each price is visible only to its bidder and the buyer">
              <div className="grid gap-3.5">
                {deal.bids.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-2xl p-4"
                    style={{ background: C.bg, border: `1px solid ${C.hairline}` }}
                  >
                    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                      <RevealField label="Bidder" field={b.providerLabel} persona={persona} />
                      <RevealField label="Sealed price" field={b.amount} persona={persona} mono format={usd} />
                      <RevealField label="Submitted" field={b.submittedAt} persona={persona} mono />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <SettlementCard deal={deal} persona={persona} onLedger={onLedger} />
          </motion.div>
        </AnimatePresence>

        {/* Auditor scope caption (reveal-time persona) */}
        {persona === 'auditor' && (
          <p className="mt-5 text-center text-[12px] leading-relaxed" style={{ color: C.ink3, fontFamily: FONT.mono }}>
            Permissioned oversight: settlements visible, sealed bids never — compliance without surveillance.
          </p>
        )}

        {/* Honesty footer */}
        <p className="mt-8 text-center text-[12px]" style={{ color: onLedger ? C.ink3 : C.fallback, fontFamily: FONT.mono }}>
          {onLedger
            ? 'Live on Canton · visibility enforced by the ledger · award executed by a Daml choice'
            : 'Demo fallback · deterministic simulation · start the Canton ledger for the live privacy proof'}
        </p>
      </div>
    </div>
  );
}

// ── Settlement (the hero card) ────────────────────────────────
function SettlementCard({ deal, persona, onLedger }: { deal: Deal; persona: Persona; onLedger: boolean }) {
  const payment = deal.settlement.payment; // present only on live-ledger deals
  const paid = onLedger && !!payment;

  return (
    <div className="tacit-card overflow-hidden">
      {/* Violet accent hairline */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${C.violet}, ${C.violetSoft})` }} />
      <div className="p-6 sm:p-7">
        {/* Hero header — source-aware, never overclaims */}
        <div className="mb-5 flex items-center gap-3">
          {onLedger ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(13,148,136,0.1)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5 L10 17.5 L19 7" stroke={C.live} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(180,83,9,0.1)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: C.fallback }} />
            </span>
          )}
          <div>
            <div className="text-[16px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>
              {paid ? 'Awarded & paid on Canton' : onLedger ? 'Awarded on Canton' : 'Simulated award'}
            </div>
            <div className="text-[13px]" style={{ color: C.ink3, fontFamily: FONT.sans }}>
              {paid
                ? 'Losers closed, the winner paid, and the settlement created in one transaction'
                : onLedger
                  ? 'Losing bids closed and the settlement created in one transaction'
                  : 'Illustrative outcome — not written to a live ledger'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <RevealField label="Status" field={deal.settlement.status} persona={persona} />
          <RevealField label="Network commitment" field={deal.settlement.commitment} persona={persona} mono />
          <RevealField label="Winner" field={deal.settlement.winner} persona={persona} />
          <RevealField label="Settled amount" field={deal.settlement.amount} persona={persona} mono format={usd} />
        </div>

        {/* The receipt moment — value that moved inside the same tx (ledger only). */}
        {payment && <PaymentReceipt payment={payment} persona={persona} />}

        {/* Contract id — the money shot, with copy */}
        <div className="mt-5 border-t pt-5" style={{ borderColor: C.hairline }}>
          <ContractField label="Settlement contract" field={deal.settlement.txId} persona={persona} />
        </div>
      </div>
    </div>
  );
}

// The transferred value. Visibility is ledger-derived (buyer + winner only);
// losers/public get a frosted PRIVATE pill exactly like every other sealed field.
function PaymentReceipt({ payment, persona }: { payment: Payment; persona: Persona }) {
  const visible = isVisible(payment.amount, persona);
  return (
    <div
      className="mt-5 rounded-2xl p-4"
      style={{ background: 'rgba(13,148,136,0.05)', border: '1px solid rgba(13,148,136,0.16)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="tacit-label" style={{ color: C.live }}>
          Value transferred
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5 L10 17.5 L19 7" stroke={C.live} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {visible ? (
        <>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="tacit-num text-[22px] font-semibold" style={{ color: C.ink, fontFamily: FONT.mono }}>
              {usd(payment.amount.value)}
            </span>
            <CurrencyBadge currency={String(payment.currency.value)} />
          </div>
          <div className="mt-2">
            <ContractField label="IOU contract" field={payment.iouContractId} persona={persona} teal />
          </div>
        </>
      ) : (
        <div className="mt-2 flex h-8 items-center">
          <FrostedPrivate />
        </div>
      )}
    </div>
  );
}

function CurrencyBadge({ currency }: { currency: string }) {
  const [tip, setTip] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      onFocus={() => setTip(true)}
      onBlur={() => setTip(false)}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      <span
        className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
        style={{ color: C.live, background: 'rgba(13,148,136,0.12)', fontFamily: FONT.mono, letterSpacing: '0.04em' }}
      >
        {currency}
      </span>
      {tip && (
        <span
          role="tooltip"
          className="tacit-glass absolute left-0 top-[calc(100%+8px)] z-50 w-[220px] rounded-xl px-3 py-2 text-left text-[12px] leading-snug"
          style={{ ...glassBlur, color: C.ink2, fontFamily: FONT.sans, boxShadow: 'var(--shadow-card)' }}
        >
          Demo voucher — roadmap: stablecoin settlement.
        </span>
      )}
    </span>
  );
}

function FrostedPrivate() {
  return (
    <span
      className="inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        color: C.ink3,
        background: 'rgba(10,10,11,0.04)',
        border: `1px solid ${C.hairline}`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontFamily: FONT.mono,
        letterSpacing: '0.06em',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" fill="currentColor" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" />
      </svg>
      PRIVATE
    </span>
  );
}

function ContractField({ label, field, persona, teal }: { label: string; field: Field<string>; persona: Persona; teal?: boolean }) {
  const visible = isVisible(field, persona);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(field.value));
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="tacit-label" style={teal ? { color: C.live } : undefined}>
        {label}
      </span>
      {visible ? (
        <div className="flex items-center gap-2">
          <span
            className="tacit-num min-w-0 truncate text-[13px] font-medium"
            style={{ color: C.ink, fontFamily: FONT.mono }}
            title={String(field.value)}
          >
            {String(field.value)}
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label.toLowerCase()} id`}
            className="ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: copied ? C.live : C.ink2,
              background: 'rgba(10,10,11,0.04)',
              border: `1px solid ${C.hairline}`,
              fontFamily: FONT.mono,
              transition: 'color 0.18s var(--micro-ease)',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      ) : (
        <div className="flex h-8 items-center">
          <span
            className="inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: C.ink3,
              background: 'rgba(10,10,11,0.04)',
              border: `1px solid ${C.hairline}`,
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              fontFamily: FONT.mono,
              letterSpacing: '0.06em',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" fill="currentColor" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            PRIVATE
          </span>
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="tacit-card p-6 sm:p-7">
      <div className="mb-5">
        <h2 className="text-[16px] font-semibold" style={{ color: C.ink, fontFamily: FONT.sans }}>
          {title}
        </h2>
        <p className="mt-0.5 text-[13px]" style={{ color: C.ink3, fontFamily: FONT.sans }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}
