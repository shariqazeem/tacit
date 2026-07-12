import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '../lens/components/TopBar';
import { C, FONT } from '../lens/components/theme';
import { WorkExperience } from './components/WorkExperience';

const TITLE = 'Tacit Work — give agents a job, keep the market private';
const DESCRIPTION =
  'Run a real private procurement on Canton: three live provider processes submit sealed bids, the winner performs the work, and delivery stays private while an auditor receives a verifiable receipt.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Tacit', type: 'website' },
};

export default function WorkPage() {
  return (
    <main style={{ background: C.bg, minHeight: '100vh' }}>
      <TopBar wordmarkHref="/" right={<LensLink />} />
      <WorkExperience />
      <noscript>
        <div style={{ padding: 24, fontFamily: FONT.sans, color: C.ink }}>
          Tacit Work runs a live procurement on Canton, so it needs JavaScript. The workflow: a request opens, three
          provider processes bid privately, the winner performs a real website audit, the buyer verifies the delivered
          bytes off-ledger, and an auditor receives a receipt — never the report.
        </div>
      </noscript>
    </main>
  );
}

function LensLink() {
  return (
    <Link
      href="/lens"
      className="tacit-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium no-underline"
      style={{ color: C.ink, fontFamily: FONT.sans, backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)', boxShadow: '0 1px 2px rgba(10,10,11,0.04)' }}
    >
      Ledger Lens
      <span aria-hidden style={{ fontSize: 12 }}>→</span>
    </Link>
  );
}
