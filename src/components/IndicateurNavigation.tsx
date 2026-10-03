'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
 *
 * ── ET D'ABORD, NE PAS AVOIR À ATTENDRE ──────────────────────────────────
 * Next ne précharge pas une page rendue à chaque visite (et ses liens du
 * menu, rangés dans un <details>, ne déclenchent même pas son préchargement
 * automatique — mesuré en production le 03/10/2026). On le fait ici, en
 * « complet » : la page entière, réutilisable cinq minutes. Mesuré : un clic
 * vers une page préchargée s'affiche en 43 ms, sans aucune requête, contre
 * 300 à 1 000 ms sans.
 *   — les pages du menu, quand le navigateur n'a plus rien à faire ;
 *   — tout lien interne dès qu'on le survole, le touche ou le cible au clavier
 *     (l'intention précède le clic de 100 à 300 ms : c'est le temps gagné).
 * Pas de préchargement en mode « économie de données » ni en 2G.
 */

const MENU = ['/', '/clubs', '/comment-ca-marche', '/tarifs', '/contact']
/** Juste sous les cinq minutes de réutilisation de Next : on rafraîchit avant. */
const FRAICHEUR_MS = 4 * 60_000

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

/** Le chemin interne d'un lien, s'il mène à une page du site (sinon null). */
function cheminDuLien(a: HTMLAnchorElement | null): string | null {
  if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null
  const cible = new URL(a.href, window.location.href)
  if (cible.origin !== window.location.origin) return null
  if (/^\/(api|documents|admin)(\/|$)/.test(cible.pathname)) return null
  return cible.pathname + cible.search
}

function connexionEconome(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  // Seulement l'économie de données demandée, ou la vraie 2G. Pas la « 3G » :
  // Chrome la déduit de la latence, et classe ainsi des connexions fixes un
  // peu lentes — celles où le préchargement fait justement gagner le plus.
  return Boolean(c?.saveData) || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g'
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
  const routeur = useRouter()
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

  // Le préchargement : le menu au repos, puis chaque lien visé.
  useEffect(() => {
    if (connexionEconome()) return
    const faits = new Map<string, number>()
    const prefetch = (href: string) => {
      const ici = window.location.pathname + window.location.search
      if (href === ici) return
      const avant = faits.get(href)
      if (avant && Date.now() - avant < FRAICHEUR_MS) return
      faits.set(href, Date.now())
      // `kind: 'full'` : la page entière, pas seulement sa coquille.
      routeur.prefetch(href, { kind: 'full' } as unknown as Parameters<typeof routeur.prefetch>[1])
    }

    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const auRepos = (fn: () => void) =>
      w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500)
    auRepos(() => MENU.forEach(prefetch))

    const surIntention = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null
      const href = cheminDuLien(a)
      if (href) prefetch(href)
    }
    document.addEventListener('pointerover', surIntention, { passive: true })
    document.addEventListener('touchstart', surIntention, { passive: true })
    document.addEventListener('focusin', surIntention)
    return () => {
      document.removeEventListener('pointerover', surIntention)
      document.removeEventListener('touchstart', surIntention)
      document.removeEventListener('focusin', surIntention)
    }
  }, [routeur])

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
