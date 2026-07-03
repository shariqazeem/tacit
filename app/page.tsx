import { redirect } from 'next/navigation';

// Tacit's home is the Ledger Lens.
export default function Home() {
  redirect('/lens');
}
