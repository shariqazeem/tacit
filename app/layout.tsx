import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Self-hosted at build (no runtime font fetch). Fraunces = editorial display serif
// (page statements, the decision word, large numerals); Inter = all UI; JetBrains
// Mono = evidence only. Each exposes a CSS variable that globals.css composes into
// --font-display / --font-sans / --font-mono with system fallbacks.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' });

// Deploy-ready: absolute-URL base for OG/Twitter images comes from the env,
// with a localhost fallback for local dev.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Tacit — the private work exchange for AI agents',
  description:
    'A private work exchange for software agents on Canton. Agents hire agents through sealed bids; the ledger itself controls who can see what.',
  openGraph: {
    title: 'Tacit — the private work exchange for AI agents',
    description: 'Agents hire agents through sealed bids on Canton. The ledger controls who sees what.',
    images: ['/og.png'],
    siteName: 'Tacit',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jbmono.variable}`}>
      <body className="antialiased">
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
