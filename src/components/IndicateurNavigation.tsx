'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { ChargeurLogo } from './ChargeurLogo'

/**
 * Le chargeur au logo, pendant qu'une page se prépare.
 *
 * Les pages publiques sont rendues par le serveur à chaque visite (le nonce de
 * la politique de sécurité l'impose) : entre le clic et la page suivante, il y
 * a quelques centaines de millisecondes — plus d'une seconde quand le serveur
 * se réveille. Sans signe de vie, le visiteur reclique ou croit le site cassé.
 *
 * L'indicateur s'arme au clic sur un lien interne et ne s'AFFICHE qu'après
 * `DELAI_MS` : une navigation rapide ne fait rien clignoter. Il disparaît dès
 * que l'adresse change. Les pages peuvent aussi l'allumer elles-mêmes avant un
 * départ long (le paiement) avec `montrerChargement('…')`.
 */

const DELAI_MS = 180
/** Filet de sécurité : jamais plus de 15 s d'écran voilé, même si une navigation échoue en silence. */
const PLAFOND_MS = 15_000
const EVENEMENT = 'bc:chargement'

type Detail = { visible: boolean; texte?: string }

/** Allume le chargeur (par exemple avant de partir vers la page de paiement). */
export function montrerChargement(texte?: string) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENEMENT, { detail: { visible: true, texte } }))
}

/** L'éteint (par exemple quand le paiement n'a finalement pas pu démarrer). */
export function cacherChargement() {
  window.dispatchEvent(new CustomEvent<Detail>(EVENEMENT, { detail: { visible: false } }))
}

function estNavigationInterne(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const a = (e.target as Element | null)?.closest?.('a')
  if (!a || !a.href) return false
  if (a.target && a.target !== '_self') return false
  if (a.hasAttribute('download')) return false
  const cible = new URL(a.href, window.location.href)
  if (cible.origin !== window.location.origin) return false
  // Une ancre sur la même page, ou la page elle-même : pas de chargement.
  if (cible.pathname === window.location.pathname && cible.search === window.location.search) return false
  // Les PDF et les routes d'API ne sont pas des pages du site.
  if (cible.pathname.startsWith('/documents/') || cible.pathname.startsWith('/api/')) return false
  return true
}

export function IndicateurNavigation() {
  const chemin = usePathname()
  const recherche = useSearchParams()
  const [etat, setEtat] = useState<{ visible: boolean; texte?: string }>({ visible: false })
  const minuteur = useRef<number | null>(null)
  const plafond = useRef<number | null>(null)

  const effacerMinuteurs = () => {
    if (minuteur.current) window.clearTimeout(minuteur.current)
    if (plafond.current) window.clearTimeout(plafond.current)
    minuteur.current = null
    plafond.current = null
  }

  // L'adresse a changé : la page est là, le chargeur s'en va.
  useEffect(() => {
    effacerMinuteurs()
    setEtat({ visible: false })
  }, [chemin, recherche])

  useEffect(() => {
    const armer = (texte?: string, immediat = false) => {
      effacerMinuteurs()
      const montrer = () => setEtat({ visible: true, texte })
      if (immediat) montrer()
      else minuteur.current = window.setTimeout(montrer, DELAI_MS)
      plafond.current = window.setTimeout(() => setEtat({ visible: false }), PLAFOND_MS)
    }

    const surClic = (e: MouseEvent) => {
      if (estNavigationInterne(e)) armer()
    }
    const surEvenement = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail
      if (d?.visible) armer(d.texte, true)
      else {
        effacerMinuteurs()
        setEtat({ visible: false })
      }
    }
    // Retour arrière depuis le prestataire de paiement : la page revient du
    // cache du navigateur avec le chargeur encore affiché. On l'éteint.
    const surRetour = (e: PageTransitionEvent) => {
      if (e.persisted) {
        effacerMinuteurs()
        setEtat({ visible: false })
      }
    }

    document.addEventListener('click', surClic, true)
    window.addEventListener(EVENEMENT, surEvenement)
    window.addEventListener('pageshow', surRetour)
    return () => {
      document.removeEventListener('click', surClic, true)
      window.removeEventListener(EVENEMENT, surEvenement)
      window.removeEventListener('pageshow', surRetour)
      effacerMinuteurs()
    }
  }, [])

  if (!etat.visible) return null
  return (
    <div className="chargeur-voile">
      <ChargeurLogo texte={etat.texte} />
    </div>
  )
}
