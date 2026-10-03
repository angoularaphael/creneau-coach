import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Montserrat } from 'next/font/google';
import { Shell } from '@/components/Shell';
import { JsonLd } from '@/components/JsonLd';
import { Mouvement } from '@/components/Mouvement';
import { IndicateurNavigation } from '@/components/IndicateurNavigation';
import { Suspense } from 'react';
import { ROBOTS_RACINE } from '@/lib/seo';
import '@/styles/jetons.css';
import '@/styles/boxing-center.css';

const display = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// Montserrat : la police de texte officielle de la marque. Libre Franklin
// n'en fait pas partie — c'était un choix par défaut, pas une décision.
const body = Montserrat({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3041';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Boxing Center — location de salles pour coachs à Toulouse',
    template: '%s · Boxing Center',
  },
  description:
    'Louez une salle à l’heure dans les 5 clubs Boxing Center de Toulouse : Minimes, Saint-Cyprien, États-Unis, Ramonville, Portet.',
  applicationName: 'Boxing Center Coachs',
  /*
   * L'INTERRUPTEUR GOUVERNE AUSSI LA RACINE.
   *
   * Cette ligne valait `{ index: false, follow: false }`, en dur. Toute page
   * sans directive propre en héritait — et basculer
   * `NEXT_PUBLIC_SEO_INDEXABLE` n'y changeait rien. Le jour de l'ouverture, une
   * partie du site serait restée invisible sans que personne ne comprenne
   * pourquoi. `ROBOTS_RACINE` existait déjà, documenté, et n'était importé par
   * personne.
   */
  robots: ROBOTS_RACINE,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // L'encre Boxing Center, pas un gris resté d'avant la refonte : c'est la
  // couleur de la barre du navigateur sur téléphone, donc la première chose
  // que la marque colore, avant même que la page s'affiche.
  themeColor: '#14162e',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
        <JsonLd />
        <Mouvement />
        <Shell>{children}</Shell>
        {/* Le chargeur au logo entre deux pages. Sous Suspense : il lit
            l'adresse (useSearchParams) et ne doit jamais retenir la page. */}
        <Suspense fallback={null}>
          <IndicateurNavigation />
        </Suspense>
      </body>
    </html>
  );
}
