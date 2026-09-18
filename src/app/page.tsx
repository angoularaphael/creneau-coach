import Link from 'next/link';
import { metadataDeRoute } from '@/lib/seo';

// L'accueil n'avait aucune metadata : ni title propre, ni description, ni canonical.
export const metadata = metadataDeRoute('/');

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-label="Louer une salle">
        {/*
          Le titre ne recompose PLUS le logo. Le vrai logo est dans l'en-tête, en
          fichier ; le répéter en dessous, en police, c'est le contrefaire deux
          fois et dire au visiteur ce qu'il sait déjà.

          Ce qu'il ne sait pas, c'est ce qu'on vend : une heure de salle. La
          première phrase confirme donc la raison du clic, elle ne la contredit
          pas — et elle porte l'intention de recherche « louer salle de boxe
          Toulouse » sans la réciter comme un robot.
        */}
        <p className="hero-kicker mono">
          <span>5 clubs · Toulouse</span>
          <span>lun — sam · 10 h → 19 h</span>
        </p>
        <h1 className="hero-titre">
          Louez une salle<br />
          <em>à l’heure.</em>
        </h1>
        <p className="hero-sous">
          Vous avez le client. Nous avons la salle, le ring et les sacs. Réservez
          l’heure qu’il vous faut, entrez avec un QR, repartez.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/clubs">
            Voir les créneaux libres
          </Link>
          <Link className="btn btn-ghost" href="/comment-ca-marche">
            Comment ça marche
          </Link>
        </div>
        <p className="hero-prix mono">
          <b>10 €</b> l’heure creuse <span aria-hidden="true">·</span> <b>15 €</b> l’heure pleine
        </p>
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
