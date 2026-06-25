'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Deal, Persona, PERSONAS } from '../types';
import { PersonaSwitcher } from './PersonaSwitcher';
import { RevealField } from './RevealField';

const ACCENT = '#7C3AED';
const INK = '#0A0A0B';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const usd = (n: number) => `$${n}`;

export function LensView({ deal, source }: { deal: Deal; source?: 'ledger' | 'memory' | null }) {
  const [persona, setPersona] = useState<Persona>('buyer');
  const active = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];

  return (
    <div className="min-h-screen w-full" style={{ background: '#FAFAF9' }}>
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[12px]" style={{ fontFamily: MONO }}>
            <span style={{ color: ACCENT, fontWeight: 600 }}>TACIT</span>
            <span style={{ color: '#D1D5DB' }}>/</span>
            <span style={{ color: '#9CA3AF' }}>LEDGER LENS</span>
          </div>
          <h1 className="mt-3 text-[28px] font-bold leading-tight" style={{ color: INK }}>
            One deal. Five views. The same ledger.
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: '#6B7280' }}>
            Switch perspective to see exactly what Canton reveals to each party — and what it keeps private.
          </p>
        </div>

        {/* Perspective switcher */}
        <PersonaSwitcher personas={PERSONAS} active={persona} onChange={setPersona} />

        {/* Live caption tied to the active persona */}
        <motion.div
          key={persona}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mt-5 rounded-xl px-4 py-3 text-[14px] leading-relaxed"
          style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)', color: '#374151' }}
        >
          <span style={{ color: ACCENT, fontWeight: 600 }}>{active.role}.</span> {active.caption}
        </motion.div>

        {/* Deal */}
        <div className="mt-6 grid gap-5">
          <Card title="The Request" subtitle="What the buyer agent is procuring">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <RevealField label="Deal" field={deal.existence} persona={persona} />
              <RevealField label="Buyer" field={deal.rfs.buyer} persona={persona} />
              <RevealField label="Service" field={deal.rfs.title} persona={persona} />
              <RevealField label="Budget" field={deal.rfs.budget} persona={persona} mono />
            </div>
          </Card>

          <Card title="Sealed Bids" subtitle="Each price is visible only to its bidder and the buyer">
            <div className="grid gap-4">
              {deal.bids.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl p-4"
                  style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)' }}
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

          <Card
            title="Atomic Settlement"
            subtitle="Awarded by a Daml choice — losing bids closed and the settlement created in one Canton transaction"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <RevealField label="Status" field={deal.settlement.status} persona={persona} />
              <RevealField label="Network commitment" field={deal.settlement.commitment} persona={persona} mono />
              <RevealField label="Winner" field={deal.settlement.winner} persona={persona} />
              <RevealField label="Settled amount" field={deal.settlement.amount} persona={persona} mono format={usd} />
              <RevealField label="Settlement contract" field={deal.settlement.txId} persona={persona} mono />
            </div>
            {/* deal.settlement.txId is the real Canton Settlement contract id, created atomically by the Award choice. */}
          </Card>
        </div>

        <p
          className="mt-8 text-center text-[12px]"
          style={{ color: source === 'ledger' ? '#9CA3AF' : '#B45309', fontFamily: MONO }}
        >
          {source === 'ledger'
            ? 'Live on Canton · visibility enforced by the ledger · award executed by a Daml choice'
            : 'Demo fallback · deterministic simulation · start the Canton ledger for the live privacy proof'}
        </p>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px -12px rgba(0,0,0,0.10)',
      }}
    >
      <div className="mb-5">
        <h2 className="text-[16px] font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        <p className="text-[13px]" style={{ color: '#9CA3AF' }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}
