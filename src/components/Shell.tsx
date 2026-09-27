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
      {/*
        LES PAGES D'INTENTION, RELIÉES.

        Quatre pages répondent chacune à une recherche relevée telle quelle
        dans Google. Une page que rien ne lie est une page que les robots
        découvrent mal, ou pas. Les ancres disent ce qu'on trouve derrière —
        « location de ring de boxe », pas « en savoir plus » : c'est l'ancre qui
        dit au moteur de quoi parle la page qu'elle désigne.

        Quatre liens et pas vingt : un pied de page qui liste tout ressemble à
        une ferme de liens, et il dilue ce qu'il devait renforcer.
      */}
      <nav aria-label="Louer à Toulouse" className="site-footer__louer">
        <Link href="/location-salle-coach-sportif-toulouse">Location de salle pour coach sportif</Link>
        <Link href="/location-salle-de-sport-a-l-heure-toulouse">Salle de sport à l’heure</Link>
        <Link href="/location-salle-de-boxe-toulouse">Location de salle de boxe</Link>
        <Link href="/location-ring-de-boxe-toulouse">Location de ring de boxe</Link>
      </nav>
      <nav aria-label="Légal">
        <Link href="/conditions-generales">Conditions générales</Link>
        <Link href="/reglement-interieur">Règlement intérieur</Link>
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/contact">Contact</Link>
        {/* Le site officiel du réseau : c'est la même organisation, et le
            dire est ce qui relie ce site à l'entité Boxing Center que les
            moteurs connaissent déjà. */}
        <a href="https://boxingcenter.fr/" rel="noopener">Le réseau Boxing Center</a>
      </nav>
      {/* « Europe/Paris » était un identifiant de fuseau horaire, affiché tel
          quel sur chaque page publique. */}
      <p className="muted">© Boxing Center — location de salles pour coachs à Toulouse</p>
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
