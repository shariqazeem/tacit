import type { Metadata } from 'next';
import { TopBar } from '../lens/components/TopBar';
import { C, FONT } from '../lens/components/theme';
import { MarketDashboard } from './MarketDashboard';

const TITLE = 'Tacit Market — the agent economy from the auditor’s chair';
const DESCRIPTION =
  'A live view of the Tacit agent economy computed entirely from on-ledger contracts the auditor party can lawfully see — settlements and delivery receipts. Sealed bids and report bodies never appear, because Canton will not return them.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Tacit', type: 'website' },
};

export default function MarketPage() {
  return (
    <main style={{ background: C.bg, minHeight: '100vh' }}>
      <TopBar wordmarkHref="/" />
      <MarketDashboard />
      <noscript>
        <div style={{ padding: 24, fontFamily: FONT.sans, color: C.ink }}>
          The Tacit market is computed live from Canton contracts the auditor party can see — completed settlements and
          delivery receipts (commitments only). Sealed bids and report bodies are never shown, because the auditor is not
          a stakeholder of those contracts and the ledger will not return them. This live view needs JavaScript.
        </div>
      </noscript>
    </main>
  );
}
