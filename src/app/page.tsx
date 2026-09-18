import Link from 'next/link';
import { metadataDeRoute } from '@/lib/seo';

// L'accueil n'avait aucune metadata : ni title propre, ni description, ni canonical.
export const metadata = metadataDeRoute('/');

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-label="Accueil">
        <div>
          <h1 className="hero-brand">
            Boxing <span>Center</span>
          </h1>
          <p>
            Réservez votre créneau coach — cinq clubs toulousains, paiement en une
            fois, accès QR le jour J.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les clubs
            </Link>
            <Link className="btn btn-ghost" href="/comment-ca-marche">
              Comment ça marche
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Un créneau. Un coach. Une salle.</h2>
          <p>
            Grille lun–sam 10h–19h. Le prix affiché vient du serveur — jamais
            recalculé dans le navigateur.
          </p>
        </div>
        <div className="steps">
          <article className="step">
            <h3>Choisir le club</h3>
            <p>Minimes, Saint-Cyprien, États-Unis, Ramonville ou Portet.</p>
          </article>
          <article className="step">
            <h3>Réserver &amp; payer</h3>
            <p>Hold 10 min, puis paiement 1× Payplug ou PayPal.</p>
          </article>
          <article className="step">
            <h3>Signer &amp; entrer</h3>
            <p>Documents, QR valide T−5, accès Deciplus automatisé.</p>
          </article>
        </div>
      </section>
    </>
  );
}
