import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSessionMe } from '@/lib/auth/session';

const links = [
  { href: '/', label: 'Accueil' },
  { href: '/clubs', label: 'Nos clubs' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/contact', label: 'Contact' },
];

export async function SiteHeader() {
  const me = await getSessionMe().catch(() => null);
  const loggedIn = Boolean(me);

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        Boxing <span>Center</span>
      </Link>
      <nav className="nav" aria-label="Principale">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        {loggedIn ? (
          <Link href="/espace-coach">Espace coach</Link>
        ) : (
          <>
            <Link href="/auth/connexion">Connexion</Link>
            <Link href="/auth/inscription">Inscription</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Légal">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/contact">Contact</Link>
      </nav>
      <p className="muted">© Boxing Center — réservation coachs · Europe/Paris</p>
    </footer>
  );
}

export async function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </>
  );
}
