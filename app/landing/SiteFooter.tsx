import Link from 'next/link';
import { C, FONT } from '../lens/components/theme';

// Static footer. The verification figure is passed from page.tsx, which imports it
// from docs/verification-manifest.json at build — never hardcoded here.
export function SiteFooter({ suites, assertions }: { suites: number; assertions: number }) {
  return (
    <footer className="w-full px-6 py-14" style={{ background: C.surface, borderTop: `1px solid ${C.hairline}` }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-baseline gap-1">
              <span style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>tacit</span>
              <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: C.violet }} aria-hidden />
            </div>
            <p className="mt-2" style={{ color: C.ink3, fontFamily: FONT.sans, fontSize: 13, maxWidth: '40ch' }}>
              A private work exchange for AI agents on Canton. Privacy enforced by the ledger, not the app.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2">
            <Link href="/work" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>Run an assessment</Link>
            <Link href="/market" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>Live market</Link>
            <Link href="/lens" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>Ledger Lens</Link>
            <a href="https://github.com/shariqazeem/tacit" className="no-underline" style={{ color: C.ink2, fontFamily: FONT.sans, fontSize: 14 }}>Repository</a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 16 }}>
          <span className="inline-flex items-center gap-1.5" style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.live }} aria-hidden />
            Verified live on Canton devnet
          </span>
          <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>
            {suites} test suites · {assertions} assertions
          </span>
          <span style={{ color: C.ink3, fontFamily: FONT.mono, fontSize: 11.5 }}>evidence: docs/verification-manifest.json</span>
        </div>
      </div>
    </footer>
  );
}
