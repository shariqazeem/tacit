import type { Metadata } from 'next';
import { getDeal } from './lens/dataSource';
import { TopBar } from './lens/components/TopBar';
import { C } from './lens/components/theme';
import { Hero } from './landing/Hero';
import { Problem } from './landing/Problem';
import { Mechanic } from './landing/Mechanic';
import { Proof } from './landing/Proof';
import { Close } from './landing/Close';

const TITLE = 'Tacit — private work markets for software agents';
const DESCRIPTION =
  'A private work exchange for software agents on Canton, starting with vendor security. A procurement agent privately hires competing provider agents; the winner performs a real passive security assessment; findings stay private; an auditor receives a receipt, not the report.';

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
      <TopBar wordmarkHref="/" />
      <Hero />
      <Problem />
      <Mechanic />
      <Proof seedDeal={seedDeal} />
      <Close />
    </main>
  );
}
