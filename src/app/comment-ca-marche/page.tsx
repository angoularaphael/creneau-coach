import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Comment ça marche' };

export default function HowItWorksPage() {
  return (
    <>
      <header className="page-hero">
        <h1>Comment ça marche</h1>
        <p>Du créneau libre au QR d’accès — sans friction inutile.</p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="steps">
          <article className="step">
            <h3>Créneau</h3>
            <p>Choisissez club, espace et horaire sur la grille lun–sam 10h–19h.</p>
          </article>
          <article className="step">
            <h3>Paiement 1×</h3>
            <p>Hold 10 minutes, puis Payplug, PayPal ou avoir — jamais de fractionné.</p>
          </article>
          <article className="step">
            <h3>Signature</h3>
            <p>CGV, règlement intérieur et décharge signés avant confirmation.</p>
          </article>
        </div>
        <p style={{ marginTop: '2rem' }}>
          <Link className="btn btn-primary" href="/clubs">
            Réserver un créneau
          </Link>
        </p>
      </section>
    </>
  );
}
