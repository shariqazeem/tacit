import type { Metadata } from 'next';
import { TopBar } from '../lens/components/TopBar';
import { C, FONT } from '../lens/components/theme';
import { WalletExperience } from './components/WalletExperience';

const TITLE = 'Your workspace on Canton · Tacit';
const DESCRIPTION =
  'Your Canton identity and the private, ledger-enforced budget you grant your AI procurement agent — fund it, cap it, revoke it, and see every spend on-ledger. Your agent can never overspend you.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Tacit', type: 'website' },
};

export default function WalletPage() {
  return (
    <main style={{ background: C.bg, minHeight: '100vh' }}>
      <TopBar wordmarkHref="/" />
      <WalletExperience />
      <noscript>
        <div style={{ padding: 24, fontFamily: FONT.sans, color: C.ink }}>
          Your Tacit workspace shows your Canton identity and the on-ledger budget you grant your procurement
          agent. Funding and revoking are real Canton transactions, so this page needs JavaScript.
        </div>
      </noscript>
    </main>
  );
}
