'use client'

import { useRouter } from 'next/navigation'
import { decompteCourt } from './temps'
import { useAZero, useMaintenant } from './horloge'

/**
 * Le décompte EN LIGNE — dans une phrase, une puce, une carte.
 *
 * Même horloge que le cadran (calée sur la seconde, premier rendu à l'heure du
 * serveur), en version texte. À zéro, il affiche `fin` et peut relire la page :
 * une place gardée qui expire disparaît de la liste « à faire » sans que le
 * coach ait à recharger quoi que ce soit.
 */
export function Decompte({
  cible,
  maintenant,
  fin = 'terminé',
  rafraichir = false,
}: {
  cible: string
  maintenant: number
  fin?: string
  rafraichir?: boolean
}) {
  const router = useRouter()
  const t = useMaintenant(maintenant)
  const reste = Math.max(0, new Date(cible).getTime() - t)
  useAZero(reste, () => {
    if (rafraichir) router.refresh()
  })
  return (
    <span className="ec-decompte" data-fini={reste <= 0 || undefined} suppressHydrationWarning>
      {reste > 0 ? decompteCourt(reste) : fin}
    </span>
  )
}
