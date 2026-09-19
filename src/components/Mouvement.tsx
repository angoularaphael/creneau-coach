'use client'

import { useEffect } from 'react'

/**
 * LE MOUVEMENT — un seul moteur pour tout le site.
 *
 * Repris de `boxing-center-muret/src/scripts/mouvement.ts` à la demande d'Eddy,
 * et porté en React. Trois règles, et rien d'autre :
 *
 * 1. Rien n'arrive posé. Chaque bloc d'une section se remplit, décalé de son
 *    voisin. Ici le geste n'est pas la montée de Muret mais le REMPLISSAGE —
 *    un masque qui s'ouvre, comme une aiguille balaie un cadran. Aucun site de
 *    la famille n'entre de la même façon : c'est ce qui les distingue au scroll.
 *
 * 2. ÇA SE REJOUE. Si on remonte au-dessus d'un bloc puis qu'on redescend, il
 *    rejoue son entrée. Une page parcourue deux fois n'est pas morte à la
 *    deuxième. En revanche on ne réarme JAMAIS un bloc qu'on vient de dépasser
 *    vers le bas — sinon la remontée devient un clignotement. C'est tout le
 *    sens du test `boundingClientRect.top > 0`.
 *
 * 3. On ne balise pas à la main. Le moteur trouve lui-même les blocs : ajouter
 *    une section, c'est hériter du mouvement sans y penser.
 *
 * L'état par défaut est VISIBLE. La classe `arme` — celle qui cache — n'est
 * posée QUE par ce script, après avoir vérifié que l'observateur existe. Sans
 * JavaScript, avec un script en échec, ou en `prefers-reduced-motion`, la page
 * s'affiche entière et lisible. Une animation ne doit jamais être la condition
 * pour voir le contenu.
 */

const EXCLUES = '.hero, [data-sans-scene]'

function blocsDe(section: HTMLElement): HTMLElement[] {
  const sortie: HTMLElement[] = []
  const enveloppes = [...section.querySelectorAll<HTMLElement>(':scope > .enveloppe')]
  const sources = enveloppes.length ? enveloppes : [section]

  for (const env of sources) {
    let enfants = [...env.children] as HTMLElement[]
    // On descend d'un niveau quand l'enveloppe n'a qu'un enfant qui est lui-même
    // une grille : sinon la section entière monterait d'un bloc et le décalage —
    // qui est tout l'intérêt — n'existerait pas.
    if (enfants.length === 1 && enfants[0] && enfants[0].children.length > 1) {
      enfants = [...enfants[0].children] as HTMLElement[]
    }
    sortie.push(...enfants)
  }
  return sortie
}

export function Mouvement() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const cibles: HTMLElement[] = []
    for (const section of document.querySelectorAll<HTMLElement>('main section, main .section')) {
      if (section.matches(EXCLUES)) continue
      blocsDe(section).forEach((b, i) => {
        if (b.classList.contains('bloc-scene')) return
        b.classList.add('bloc-scene', 'arme')
        b.style.setProperty('--i', String(i))
        cibles.push(b)
      })
    }
    for (const e of document.querySelectorAll<HTMLElement>('.reveler')) {
      if (!e.classList.contains('bloc-scene')) {
        e.classList.add('bloc-scene', 'arme')
        cibles.push(e)
      }
    }
    if (!cibles.length) return

    /**
     * PREMIÈRE PEINTURE : ON NE JOUE RIEN — ET ON NE PARIE PAS SUR L'HORLOGE.
     *
     * Un bloc déjà à l'écran au chargement n'ARRIVE pas : il est là. L'animer,
     * c'est animer l'état de départ. À l'ouverture d'une page, trois ou quatre
     * blocs se mettaient à rebondir ensemble sans que le lecteur ait rien fait.
     * Ça se lit comme un bug, et c'en est un.
     *
     * Premier essai : poser un drapeau le temps de deux images, puis le
     * retirer. C'était une COURSE entre ce drapeau et le premier appel de
     * l'observateur — et une course, ça se perd une fois sur deux, sur les
     * machines des autres.
     *
     * Donc on ne mesure plus le temps, on mesure l'espace. Au démarrage, on
     * lit les rectangles À LA MAIN, tout de suite : ce qui est déjà dans la
     * fenêtre est marqué vu ET dispensé de geste. Aucun délai, aucun hasard.
     *
     * La dispense est retirée dès que le bloc se réarme. Un bloc vu au
     * chargement, puis quitté franchement, rejouera son entrée au retour —
     * c'est bien la règle voulue, et elle survit.
     */
    const hauteur = innerHeight

    /**
     * DEUX OBSERVATEURS, ET C'EST TOUT LE SUJET.
     *
     * Avec un seul, révéler et réarmer partagent la même frontière. Un bloc
     * posé pile sur cette frontière bascule à chaque petit mouvement de
     * molette : révélé, réarmé, révélé. En lecture normale, ça donne le
     * « bouncy bouncy bouncy » — pas un défaut d'animation, un défaut
     * d'hystérésis.
     *
     * Il en faut donc deux, avec des seuils différents :
     *
     *   RÉVÉLER  se déclenche tôt, au bord de l'écran (−8 %), pour que le bloc
     *            soit déjà en place quand l'œil y arrive.
     *   RÉARMER  ne se déclenche que LOIN, à 45 % d'écran sous le pli. Il faut
     *            vraiment s'être éloigné pour que le bloc redevienne rejouable.
     *
     * Entre les deux, une large bande morte où rien ne change. C'est elle qui
     * rend la lecture calme : on peut monter et descendre de quelques lignes
     * sans réveiller quoi que ce soit.
     */
    const obsReveler = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) if (e.isIntersecting) e.target.classList.add('vu')
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    )

    const obsRearmer = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) continue
          // Toujours par le bas seulement : sortir par le haut, c'est avoir lu.
          if (e.boundingClientRect.top > 0) {
            // La dispense tombe avec le réarmement : au retour, le bloc rejoue.
            e.target.classList.remove('vu', 'sans-geste')
          }
        }
      },
      { rootMargin: '45% 0px 45% 0px', threshold: 0 },
    )

    for (const c of cibles) {
      const r = c.getBoundingClientRect()
      if (r.top < hauteur && r.bottom > 0) {
        c.classList.add('vu', 'sans-geste')
      }
      obsReveler.observe(c)
      obsRearmer.observe(c)
    }

    /**
     * LE FILET. Un bloc en attente est un bloc invisible. Si l'observateur ne
     * s'exécute pas — onglet en arrière-plan, rendu suspendu, moteur exotique —
     * personne ne doit rester devant une page vide. On recalcule une fois à la
     * main : le calcul de rectangle fonctionne là où l'observateur ne tourne pas.
     */
    const filet = () => {
      for (const c of cibles) {
        if (c.classList.contains('vu')) continue
        const r = c.getBoundingClientRect()
        if (r.top < innerHeight && r.bottom > 0) c.classList.add('vu')
      }
    }
    const t = setTimeout(filet, 1400)
    const auRetour = () => setTimeout(filet, 200)
    addEventListener('pageshow', auRetour)

    return () => {
      clearTimeout(t)
      removeEventListener('pageshow', auRetour)
      obsReveler.disconnect()
      obsRearmer.disconnect()
      /**
       * On rend le DOM tel qu'on l'a trouvé — `bloc-scene` COMPRIS.
       *
       * Ne retirer que `arme` laissait `bloc-scene` collé aux éléments. Or le
       * balayage d'entrée saute tout ce qui porte déjà `bloc-scene`. En mode
       * strict, React monte, démonte, remonte : le démontage désarmait, et le
       * remontage passait son chemin. Résultat, plus rien n'était armé et
       * l'animation n'existait plus du tout en développement — invisible en
       * production, donc impossible à voir en la cherchant là où on travaille.
       *
       * `vu` reste en place volontairement : au remontage le bloc se retrouve
       * `arme` ET `vu`, donc visible, et il n'y a pas de clignotement.
       */
      cibles.forEach((c) => c.classList.remove('arme', 'bloc-scene', 'sans-geste'))
    }
  }, [])

  return null
}
