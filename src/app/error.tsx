'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * L'erreur imprévue — on s'excuse, on propose de réessayer, on ne montre
 * jamais de trace technique. `retry` (Next 16) recharge le segment sans
 * perdre le reste de la page.
 */
export default function ErreurPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[page]', error.digest ?? error.message)
  }, [error])

  return (
    <header className="page-hero page-hero--visuel" data-visuel="contact">
      <p className="sur mono">Un contretemps</p>
      <h1>Cette page n’a pas pu s’afficher.</h1>
      <p className="page-hero__sous">
        C’est de notre côté, pas du vôtre. Réessayez : la plupart du temps, la
        seconde tentative passe. Vos réservations et vos paiements ne sont pas
        touchés.
      </p>
      <div className="hero-actions">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Réessayer
        </button>
        <Link className="btn btn-ghost" href="/">
          Revenir à l’accueil
        </Link>
      </div>
    </header>
  )
}
