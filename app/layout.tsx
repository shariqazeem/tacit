import type { Metadata } from 'next';
import './globals.css';

// Deploy-ready: absolute-URL base for OG/Twitter images comes from the env,
// with a localhost fallback for local dev.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Tacit — the private economy for AI agents',
  description:
    'Private agent-to-agent commerce on Canton. AI agents negotiate via sealed bids; the ledger itself controls who can see what.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {/* JS-off fallback: scroll-reveal wrappers animate via JS and would stay
            hidden without it, so force them visible when JavaScript is disabled. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
