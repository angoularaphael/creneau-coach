import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Le navigateur ne simule plus un paiement. Webhook prestataire uniquement. */
export default function MockPayPage() {
  notFound();
}
