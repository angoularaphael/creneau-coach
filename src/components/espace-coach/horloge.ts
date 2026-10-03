'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * L'HORLOGE PARTAGÉE DES DÉCOMPTES.
 *
 * Le premier rendu utilise l'heure du SERVEUR (`depart`), passée en prop : le
 * HTML envoyé et la première image hydratée affichent donc exactement le même
 * chiffre. Sans ça, le serveur écrivait « 07:42 », le téléphone « 07:41 », et
 * React signalait une hydratation divergente sur chaque décompte de la page.
 *
 * Le battement est CALÉ sur la seconde ronde (`pas - Date.now() % pas`) et
 * non sur un `setInterval` lancé au hasard : deux décomptes de la même page
 * changent de chiffre en même temps, comme les aiguilles d'une même montre.
 * Un intervalle libre dérive, et deux compteurs qui ne battent pas ensemble se
 * voient immédiatement.
 */
export function useMaintenant(depart: number, pas = 1000): number {
  const [t, setT] = useState(depart)
  useEffect(() => {
    let id = 0
    const battre = () => {
      setT(Date.now())
      id = window.setTimeout(battre, pas - (Date.now() % pas) + 4)
    }
    battre()
    // Un onglet mis en arrière-plan ralentit ses minuteries : au retour, on se
    // recale tout de suite au lieu d'afficher une seconde vieille d'une minute.
    const auRetour = () => {
      if (document.visibilityState === 'visible') setT(Date.now())
    }
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [pas])
  return t
}

/**
 * Appelle `quand` UNE fois, au moment où `reste` passe de positif à zéro.
 * Pas au montage si c'est déjà zéro : la page a été rendue dans cet état par
 * le serveur, il n'y a rien à rattraper.
 */
export function useAZero(reste: number, quand: () => void) {
  const avant = useRef(reste)
  const rappel = useRef(quand)
  useEffect(() => {
    rappel.current = quand
  })
  useEffect(() => {
    if (avant.current > 0 && reste <= 0) rappel.current()
    avant.current = reste
  }, [reste])
}

/** Vrai si le visiteur a demandé moins de mouvement. Faux côté serveur. */
export function useMoinsDeMouvement(): boolean {
  const [moins, setMoins] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setMoins(mq.matches)
    const suivre = () => setMoins(mq.matches)
    mq.addEventListener('change', suivre)
    return () => mq.removeEventListener('change', suivre)
  }, [])
  return moins
}
