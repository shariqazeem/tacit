import type { Metadata } from 'next';
import { getDeal } from './dataSource';
import { LensExperience } from './components/LensExperience';
import { HideAppChrome } from './components/HideAppChrome';

export const metadata: Metadata = {
  title: 'Ledger Lens · Tacit',
  description: 'One deal, five views — see exactly what Canton reveals to each party.',
};

// Server component: data enters through the single getDeal() seam.
// At P3, getDeal() reads the live Canton ledger; this file stays unchanged.
export default async function LensPage() {
  const deal = await getDeal();
  return (
    <>
      <HideAppChrome />
      <LensExperience seedDeal={deal} />
    </>
  );
}
