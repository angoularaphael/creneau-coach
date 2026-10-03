import type { ReactNode } from 'react'
import { studioActif } from '@/lib/studio/session'
import '@/styles/espace-coach.css'

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
   *
   * La feuille `espace-coach.css` n'est importée QU'ICI : le site public ne la
   * télécharge jamais, et elle ne peut rien y casser.
   */
  return (
    <div className="espace-clair">
      {test ? (
        // Le bandeau du mode studio : visible sur chaque page de l'espace, pour
        // qu'aucun paiement d'essai ne soit pris pour un vrai.
        <p className="ec-studio" role="status">
          <span className="ec-studio__point" aria-hidden="true" />
          <span>
            <b>Mode studio</b> — paiements d’essai, aucun argent réel n’est pris. Se coupe depuis le
            back-office.
          </span>
        </p>
      ) : null}
      {children}
    </div>
  )
}
