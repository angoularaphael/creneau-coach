import Image from 'next/image';
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
      {/*
        Le logo est un FICHIER, jamais du texte.

        L'en-tête recomposait « Boxing Center » en Bebas Neue. Le logo officiel
        est un lettrage arqué avec contour blanc et filet cuivre : retapé en
        police, ce n'est plus le logo, c'est une imitation. Tous les sites frères
        posent `logo-blanc.png` de la même façon — même fichier, même méthode.

        `priority` : le logo est dans le premier écran, il ne doit pas arriver
        après le texte.
      */}
      <Link href="/" className="brand" aria-label="Boxing Center — accueil">
        <Image
          src="/logo-blanc.png"
          alt="Boxing Center"
          width={132}
          height={44}
          priority
        />
      </Link>
      {/*
        NAVIGATION — un menu natif, sans JavaScript.

        Le rail qui défilait horizontalement cachait ses deux premières entrées :
        on ouvrait le site sur un menu tronqué. Ici, `<details>` fait le travail
        du navigateur : il s'ouvre au clavier, se ferme à Échap, fonctionne
        script désactivé, et ne coûte aucun octet de JS.

        À partir de 60 rem, le `<summary>` disparaît et la liste se pose en ligne :
        le même balisage sert les deux tailles, il n'y a pas deux menus à tenir
        synchronisés — c'est exactement l'erreur qui finit par diverger.
      */}
      <details className="menu">
        <summary className="menu__bouton" aria-label="Ouvrir le menu">
          <span className="menu__barres" aria-hidden="true" />
          <span className="menu__mot">Menu</span>
        </summary>
        <nav className="nav" aria-label="Principale">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          {loggedIn ? (
            <Link className="nav__compte" href="/espace-coach">Espace coach</Link>
          ) : (
            <>
              <Link href="/auth/connexion">Connexion</Link>
              <Link className="nav__compte" href="/auth/inscription">Inscription</Link>
            </>
          )}
        </nav>
      </details>
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
