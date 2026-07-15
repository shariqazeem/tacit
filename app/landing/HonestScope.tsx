'use client';

import { C, FONT } from '../lens/components/theme';
import { Reveal } from './Reveal';

const NOTES = [
  { k: 'Demo credits, not money', d: 'Payment is a USD.demo voucher moved on-ledger — not real money, a stablecoin, or Canton Coin.' },
  { k: 'One validator credential', d: 'The three provider agents are separate OS processes bidding as distinct Canton parties, but they share one hosted-validator credential — not separate validators or organizations.' },
  { k: 'A passive pre-screen', d: 'Assessments are passive, public-surface checks (TLS, headers, DNS, timing) — not a penetration test, vulnerability scan, or certification.' },
  { k: 'Buyer verifies, not Canton', d: 'The buyer application re-hashes and recomputes the score off-ledger. Canton proves who saw what and that payment happened — not that a report is objectively correct.' },
];

export function HonestScope() {
  return (
    <section className="w-full px-6 py-24 sm:py-28" style={{ background: C.bg }}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <div style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Honest scope</div>
          <h2 className="mt-3 t-h2" style={{ color: C.ink, maxWidth: '24ch' }}>What’s real, stated plainly.</h2>
          <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15, lineHeight: 1.6, maxWidth: '58ch' }}>
            The privacy, the sealed bids, the atomic payment, the verification and the receipts are real on the
            Canton devnet. These are the limits — up front, not in a footnote.
          </p>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NOTES.map((n, i) => (
            <Reveal key={n.k} delay={0.04 * i}>
              <div className="material-clear p-4">
                <div style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600 }}>{n.k}</div>
                <div className="mt-1" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.55 }}>{n.d}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
