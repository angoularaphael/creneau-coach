import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Libre_Franklin } from 'next/font/google';
import { Shell } from '@/components/Shell';
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

export const metadata: Metadata = {
  title: {
    default: 'Boxing Center — Réservation coachs',
    template: '%s · Boxing Center',
  },
  description:
    'Réservez un créneau coach dans les 5 clubs Boxing Center : Minimes, Saint-Cyprien, États-Unis, Ramonville, Portet.',
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
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
