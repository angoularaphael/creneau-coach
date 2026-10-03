'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * UN CHIFFRE QUI SE REMPLIT — la signature du site (« rien ne glisse, tout se
 * remplit ») appliquée aux nombres du tableau de bord.
 *
 * Le chiffre monte de zéro à sa valeur la première fois qu'il entre à l'écran,
 * en 900 ms, freiné en fin de course : l'œil voit une grandeur se constituer,
 * pas un nombre posé. C'est ce qui fait remarquer « 3/3 » ou « 10 € d'avoir »
 * sans gras ni couleur supplémentaire.
 *
 * Le HTML du serveur porte DÉJÀ la valeur finale : sans JavaScript, en
 * mouvement réduit, ou si l'observateur n'existe pas, le bon chiffre est là.
 * L'animation ne part de zéro qu'une fois le script prêt — jamais l'inverse.
 */
export function Compteur({
  valeur,
  format = 'entier',
}: {
  valeur: number
  /** `euros` : la valeur est en centimes. */
  format?: 'entier' | 'euros'
}) {
  const [affiche, setAffiche] = useState(valeur)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || valeur === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    let raf = 0
    const jouer = () => {
      const t0 = performance.now()
      const pas = (t: number) => {
        const p = Math.min(1, (t - t0) / 900)
        const e = 1 - Math.pow(1 - p, 3)
        setAffiche(Math.round(valeur * e))
        if (p < 1) raf = requestAnimationFrame(pas)
      }
      raf = requestAnimationFrame(pas)
    }
    const obs = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          obs.disconnect()
          setAffiche(0)
          jouer()
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(raf)
      setAffiche(valeur)
    }
  }, [valeur])

  const texte =
    format === 'euros'
      ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(affiche / 100)
      : String(affiche)

  return (
    <span ref={ref} className="ec-compteur">
      {/* Le lecteur d'écran lit la valeur finale, pas les étapes de la montée. */}
      <span aria-hidden="true">{texte}</span>
      <span className="vh">
        {format === 'euros'
          ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(valeur / 100)
          : valeur}
      </span>
    </span>
  )
}
