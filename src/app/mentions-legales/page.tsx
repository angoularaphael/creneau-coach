import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mentions légales' };

export default function MentionsPage() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="mentions-legales">
        <h1>Mentions légales</h1>
        <p className="muted">Textes direction à intégrer — placeholder Lot B.</p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <p>
          Éditeur : Boxing Center — contact{' '}
          <a href="mailto:boxingcenter31@gmail.com">boxingcenter31@gmail.com</a>.
        </p>
        <p>
          Hébergement et traitement des données : précisés dans la politique de
          confidentialité.
        </p>
      </section>
    </>
  );
}
