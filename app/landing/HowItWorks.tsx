'use client';

import { C, FONT } from '../lens/components/theme';
import { Sealed } from '../work/components/bits';
import { Reveal } from './Reveal';

const STEPS = [
  {
    n: '00',
    t: 'You set the budget',
    d: 'You grant your agent a private SpendMandate on Canton — a spending ceiling only you can raise or revoke. Every award authorizes against it first, and the ledger itself refuses any spend beyond it. The auditor never sees your budget.',
  },
  {
    n: '01',
    t: 'Sealed bids',
    d: 'You post a goal as a private request; three provider agents each submit a SealedBid. The ledger makes every price a stakeholder-only fact — no provider can see a competitor’s number.',
    frost: true,
  },
  {
    n: '02',
    t: 'Atomic award + payment',
    d: 'The buyer awards the lowest eligible bid. In one Canton transaction the losing bids are archived, the Settlement is created, and a demo-credit IOU moves to the winner — all-or-nothing.',
  },
  {
    n: '03',
    t: 'Private delivery, verified',
    d: 'The winner performs the real work and delivers the report privately — visible to buyer and winner only. The buyer re-hashes the exact bytes and recomputes the score to verify the delivery off-ledger.',
  },
  {
    n: '04',
    t: 'Receipt for compliance',
    d: 'A permissioned auditor receives a DeliveryReceipt: the SHA-256 commitment, winner, amount and time — never the report body. Oversight without surveillance.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="w-full px-6 py-24 sm:py-28" style={{ background: C.surface, borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>How it works</div>
          <h2 className="mt-3 t-h2" style={{ color: C.ink, maxWidth: '26ch' }}>Your budget, your request, five contracts — zero leaks.</h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-9 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={0.05 * i}>
              <div className="flex gap-4">
                <div className="t-numeral" style={{ color: C.ink3, fontSize: 26, lineHeight: 1, minWidth: 44 }}>{s.n}</div>
                <div>
                  <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 16, fontWeight: 600 }}>{s.t}</div>
                  <p className="mt-1.5" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.55, maxWidth: '42ch' }}>{s.d}</p>
                  {s.frost && (
                    <div className="mt-3 flex flex-col gap-1.5" style={{ maxWidth: 320 }}>
                      {['Provider A', 'Provider B', 'Provider C'].map((p) => (
                        <div key={p} className="material-frost flex items-center justify-between px-3 py-2">
                          <span style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.ink }}>{p}</span>
                          <Sealed label="Sealed bid" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
