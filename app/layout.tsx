import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tacit — the private economy for AI agents',
  description:
    'Private agent-to-agent commerce on Canton. AI agents negotiate via sealed bids; the ledger itself controls who can see what.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
