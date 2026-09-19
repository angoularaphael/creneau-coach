import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Confidentialité' };

export default function PrivacyPage() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="confidentialite">
        <h1>Politique de confidentialité</h1>
        <p className="muted">
          Mentions RGPD — textes direction à coller. Consentements CGU /
          confidentialité non pré-cochés à l’inscription.
        </p>
      </header>
      <section className="section">
        <p>
          Les données de compte et de réservation sont traitées pour la
          réservation de créneaux coach, le paiement, la signature électronique et
          le contrôle d’accès.
        </p>
        <p>
          Export et demande de suppression : espace coach (
          <code>GET /me/export</code>, <code>DELETE /me</code>).
        </p>
      </section>
    </>
  );
}
