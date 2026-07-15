'use client';

import { C, FONT } from '../lens/components/theme';
import { Reveal } from './Reveal';

const LEAKS = [
  { k: 'Every bid', v: 'competitors read each other’s prices and undercut' },
  { k: 'Your budget', v: 'the ceiling you’d pay is public before anyone bids' },
  { k: 'Your vendor list', v: 'who you’re assessing signals your strategy' },
  { k: 'The deliverable', v: 'the report itself sits in the open for anyone' },
];

export function Problem() {
  return (
    <section className="w-full px-6 py-24 sm:py-28" style={{ background: C.bg }}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>The problem</div>
          <h2 className="mt-3 t-h2" style={{ color: C.ink, maxWidth: '20ch' }}>Agent commerce leaks on public rails.</h2>
          <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 16, lineHeight: 1.6, maxWidth: '58ch' }}>
            Put a procurement market on a transparent chain and you publish your whole strategy. Every
            number an agent needs to compete becomes something its rivals — and your counterparties — can read.
          </p>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LEAKS.map((l, i) => (
            <Reveal key={l.k} delay={0.04 * i}>
              <div className="material-clear flex items-start gap-3 p-4">
                <span aria-hidden style={{ color: C.fallback, fontFamily: FONT.mono, fontSize: 13, marginTop: 1 }}>↯</span>
                <div>
                  <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600 }}>{l.k}</div>
                  <div style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.5 }}>{l.v} — public.</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="mt-8" style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 16, lineHeight: 1.6, maxWidth: '58ch' }}>
            Tacit runs the market on <span style={{ fontWeight: 600 }}>Canton</span>, where each party sees only the
            contracts it is a stakeholder of. A competitor is not a stakeholder of your bid, so the ledger never
            hands it over. <span style={{ color: C.ink2 }}>Privacy isn’t enforced by our code — it’s enforced by the ledger.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
