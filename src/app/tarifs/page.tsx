import type { Metadata } from 'next';
import Link from 'next/link';
import { formatCents } from '@/lib/api/client';

export const metadata: Metadata = { title: 'Tarifs' };

export default function TarifsPage() {
  return (
    <>
      <header className="page-hero">
        <p className="sur mono">Sans abonnement</p>
        <h1>Deux prix, c’est tout</h1>
        <p className="page-hero__sous">
          Le prix dépend de l’heure, jamais du club ni de l’espace. Il est affiché
          avant que vous ne payiez, et il ne bouge plus une fois votre créneau réservé.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="club-list">
          <div className="club-link">
            <h3>Heures creuses</h3>
            <p className="meta">10–12h · 14–17h</p>
            <p style={{ color: 'var(--ink)', marginTop: '1rem', fontSize: '1.4rem' }}>
              {formatCents(1000)}
            </p>
          </div>
          <div className="club-link">
            <h3>Heures pleines</h3>
            <p className="meta">12–14h · 17–19h</p>
            <p style={{ color: 'var(--ink)', marginTop: '1rem', fontSize: '1.4rem' }}>
              {formatCents(1500)}
            </p>
          </div>
        </div>
        <p className="note">
          Annulation &gt; 24 h avant → avoir du montant de la résa. Moins de 24 h →
          trop tard.
        </p>
        <p style={{ marginTop: '1.5rem' }}>
          <Link className="btn btn-ghost" href="/clubs">
            Voir les clubs
          </Link>
        </p>
      </section>
    </>
  );
}
