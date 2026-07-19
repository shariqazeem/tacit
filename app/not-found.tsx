import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from './lens/components/TopBar';
import { C, FONT } from './lens/components/theme';

export const metadata: Metadata = {
  title: 'Not found · Tacit',
  description: 'That page does not exist.',
};

// Minimal, in-system 404 — Clear material, Fraunces statement, the three real routes.
export default function NotFound() {
  const links = [
    { href: '/work', label: 'Give agents a job', hint: 'run a private procurement on Canton' },
    { href: '/market', label: 'The live market', hint: 'the agent economy from the auditor’s chair' },
    { href: '/lens', label: 'The privacy lens', hint: 'one deal, five views' },
  ];
  return (
    <main style={{ background: C.bg, minHeight: '100vh' }}>
      <TopBar wordmarkHref="/" />
      <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-28 sm:px-8">
        <div style={{ color: C.violet, fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          404 · page not found
        </div>
        <h1 className="mt-3" style={{ color: C.ink, fontFamily: FONT.display, fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.03 }}>
          That page isn’t on the ledger.
        </h1>
        <p className="mt-4" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 15.5, lineHeight: 1.6, maxWidth: '52ch' }}>
          The link may be old or mistyped. Here’s where the real work lives.
        </p>
        <div className="mt-8 flex flex-col gap-2.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="material-clear no-underline flex items-baseline justify-between gap-4 px-4 py-3.5"
              style={{ borderColor: C.hairline }}
            >
              <span style={{ color: C.ink, fontFamily: FONT.sans, fontSize: 15, fontWeight: 600 }}>{l.label}</span>
              <span style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 12.5 }}>{l.hint}</span>
            </Link>
          ))}
        </div>
        <Link href="/" className="mt-6 inline-block no-underline" style={{ color: C.violet, fontFamily: FONT.sans, fontSize: 13.5, fontWeight: 600 }}>
          ← Back to the overview
        </Link>
      </div>
    </main>
  );
}
