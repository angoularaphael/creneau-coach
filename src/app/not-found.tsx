import type { Metadata } from 'next'
import Link from 'next/link'

import { ProchainesHeures } from '@/components/ProchainesHeures'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: true },
}

/**
 * La page introuvable — en français, à la marque, et utile.
 *
 * Avant le 02/10/2026, un lien cassé affichait la page par défaut de Next :
 * « 404 | This page could not be found », en anglais, sur fond blanc. Le
 * visiteur qui tombe ici cherchait presque toujours une salle : on la lui
 * montre tout de suite, avec les vraies heures libres.
 */
export default function NotFound() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="clubs">
        <p className="sur mono">Erreur 404</p>
        <h1>Cette page n’existe pas. La salle, si.</h1>
        <p className="page-hero__sous">
          Le lien est ancien ou mal recopié. Les cinq clubs, eux, sont ouverts :
          choisissez une heure ci-dessous, ou repartez de l’accueil.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/clubs">
            Voir les cinq clubs
          </Link>
          <Link className="btn btn-ghost" href="/">
            Revenir à l’accueil
          </Link>
        </div>
      </header>
      <ProchainesHeures titre="Ce qui est libre en ce moment." />
    </>
  )
}
