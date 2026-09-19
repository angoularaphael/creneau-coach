'use client'

import { useEffect } from 'react'

/**
 * MARQUER CE QUI DÉBORDE VRAIMENT.
 *
 * Les bandes de filtres du back-office défilent horizontalement quand elles
 * sont trop longues. Un dégradé sur l'arête droite prévient que ça continue —
 * sans lui, la dernière puce est tranchée en plein mot et on lit « cassé »
 * plutôt que « ça continue ».
 *
 * Sauf que la CSS ne sait pas si un contenu déborde. Le dégradé s'appliquait
 * donc aussi à une bande d'UNE SEULE puce qui tient largement : un bouton
 * unique à moitié éteint, ce qui est exactement l'impression de bug qu'on
 * voulait éviter.
 *
 * Ce composant ne fait qu'une chose : poser `data-deborde` sur les conteneurs
 * dont le contenu dépasse réellement. La CSS s'en sert comme condition.
 *
 * ── POURQUOI SI PEU ───────────────────────────────────────────────────────
 *
 * Aucun état React, aucun rendu. On lit deux nombres et on pose un attribut.
 * Le dégradé est une aide à la lecture, pas une fonctionnalité : s'il n'arrive
 * jamais — script en échec, JavaScript coupé — la bande défile quand même, et
 * rien n'est perdu. C'est pour ça qu'il n'a pas besoin de mieux.
 *
 * `ResizeObserver` plutôt qu'un écouteur de redimensionnement de fenêtre : une
 * bande peut changer de largeur sans que la fenêtre bouge — un panneau qui
 * s'ouvre, une police qui finit de charger, un club qui a trois espaces au
 * lieu d'un.
 */
export function Debordement({ selecteur }: { selecteur: string }) {
  useEffect(() => {
    const cibles = [...document.querySelectorAll<HTMLElement>(selecteur)]
    if (cibles.length === 0) return

    const mesurer = (e: HTMLElement) => {
      // Une tolérance d'un pixel : les largeurs fractionnaires font déborder
      // de 0,4 px des bandes qui tiennent parfaitement.
      e.dataset.deborde = e.scrollWidth > e.clientWidth + 1 ? 'true' : 'false'
    }

    cibles.forEach(mesurer)

    const obs = new ResizeObserver((entrees) => {
      for (const entree of entrees) mesurer(entree.target as HTMLElement)
    })
    cibles.forEach((c) => obs.observe(c))

    return () => {
      obs.disconnect()
      // On rend le DOM tel qu'on l'a trouvé : sinon un attribut resté en place
      // ferait croire à la CSS qu'une bande déborde encore.
      cibles.forEach((c) => delete c.dataset.deborde)
    }
  }, [selecteur])

  return null
}
