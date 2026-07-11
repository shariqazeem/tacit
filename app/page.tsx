import type { Metadata } from 'next';
import Link from 'next/link';
import { getDeal } from './lens/dataSource';
import { TopBar } from './lens/components/TopBar';
import { C, FONT } from './lens/components/theme';
import { Hero } from './landing/Hero';
import { Problem } from './landing/Problem';
import { Mechanic } from './landing/Mechanic';
import { Proof } from './landing/Proof';
import { Close } from './landing/Close';

const TITLE = 'Tacit — the private economy for AI agents';
const DESCRIPTION =
  'Private agent-to-agent commerce on Canton. AI agents negotiate via sealed bids; the buyer awards and pays the winner atomically; the ledger itself controls who can see what.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Tacit',
    type: 'website',
    images: [{ url: '/art/ogimage.png', width: 1672, height: 941, alt: 'Tacit — a frosted-glass prism refracting light' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/art/ogimage.png'],
  },
};

// Tacit's home: a scroll-driven product story that hands off into the live
// product at /lens. Server component → SSR. Reuses the /lens seed deal for the
// (clearly-labeled) Beat-4 Lens preview.
export default async function Home() {
  const seedDeal = await getDeal();

  return (
    <main style={{ background: C.bg }}>
      <TopBar wordmarkHref="/" right={<OpenLensButton />} />
      <Hero />
      <Problem />
      <Mechanic />
      <Proof seedDeal={seedDeal} />
      <Close />
    </main>
  );
}

function OpenLensButton() {
  return (
    <Link
      href="/lens"
      className="tacit-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium no-underline"
      style={{
        color: C.ink,
        fontFamily: FONT.sans,
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        boxShadow: '0 1px 2px rgba(10,10,11,0.04)',
      }}
    >
      Open the Lens
      <span aria-hidden style={{ fontSize: 12 }}>→</span>
    </Link>
  );
}
