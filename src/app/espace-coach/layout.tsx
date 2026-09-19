import type { ReactNode } from 'react'
import { studioActif } from '@/lib/studio/session'

export const dynamic = 'force-dynamic'

export default async function EspaceCoachLayout({ children }: { children: ReactNode }) {
  const test = await studioActif()
  /**
   * Le tableau de bord bascule en CLAIR.
   *
   * Le site public reste noir — c'est une vitrine. Ici on travaille : on
   * revient plusieurs fois par semaine lire des tableaux, des statuts, des
   * horaires. Le fond clair fatigue moins et fait ressortir la donnée.
   *
   * Le thème est porté par un conteneur et pas par `<html>`, volontairement :
   * l'en-tête du site reste sombre au-dessus. Ce n'est pas un compromis
   * technique, c'est la séparation qu'on veut voir — la barre de marque d'un
   * côté, l'espace de travail de l'autre.
   */
  return (
    <div className="espace-clair">
      {test ? (
        <p className="note" role="status" style={{ margin: '0.75rem 1rem' }}>
          Mode studio : Payplug TEST, pas d’argent réel. Éteindre depuis le
          back-office.
        </p>
      ) : null}
      {children}
    </div>
  )
}
