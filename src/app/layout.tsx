import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Libre_Franklin } from 'next/font/google';
import { Shell } from '@/components/Shell';
import { JsonLd } from '@/components/JsonLd';
import '@/styles/boxing-center.css';

const display = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Libre_Franklin({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3041';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Boxing Center — Réservation coachs',
    template: '%s · Boxing Center',
  },
  description:
    'Réservez un créneau coach dans les 5 clubs Boxing Center : Minimes, Saint-Cyprien, États-Unis, Ramonville, Portet.',
  applicationName: 'Boxing Center Coachs',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0d0f',
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
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
