import type { ReactNode } from 'react'

import { getClubBySlug } from '@/lib/seo'
import { CLUBS_VERITE } from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

/**
 * La mise en page commune de la connexion et de l'inscription.
 *
 * Le formulaire s'étirait sur toute la largeur de l'écran (la classe
 * `section--etroite` n'a jamais existé en CSS) : des champs de 1 100 px, l'air
 * d'un formulaire administratif. Il vit maintenant dans une carte de lecture
 * confortable, et à côté, ce qui attend le coach — parce qu'on remplit un
 * formulaire plus volontiers quand on sait à quoi il mène.
 *
 * Quand le coach arrive depuis un créneau (`next=/clubs/…?creneau=…`), on le
 * lui dit : son heure l'attend, et il y revient tout de suite après.
 */

function clubDuRetour(next: string): string | null {
  const m = next.match(/^\/clubs\/([a-z0-9-]+)/)
  if (!m) return null
  const fiche = getClubBySlug(m[1] ?? '')
  if (!fiche) return null
  const verite = CLUBS_VERITE[fiche.clubId as keyof typeof CLUBS_VERITE]
  return verite ? verite.nom.replace('Boxing Center Toulouse ', '').replace('Boxing Center ', '') : null
}

export function AccesCoach({ next, children }: { next: string; children: ReactNode }) {
  const club = clubDuRetour(next)
  const avecCreneau = club !== null && next.includes('creneau=')

  return (
    <section className="section">
      <div className="acces">
        <div className="acces__carte">{children}</div>

        <aside className="acces__a-cote" aria-label="Ce qui vous attend">
          {club ? (
            <p className="acces__retour">
              <span aria-hidden="true">↩</span>
              {avecCreneau
                ? `Votre heure vous attend au club ${club} : vous y revenez juste après, la réservation ouverte.`
                : `Vous revenez ensuite sur le planning du club ${club}.`}
            </p>
          ) : null}

          <h2 className="acces__titre">Quatre gestes, puis la salle.</h2>
          <ol className="acces__etapes">
            <li>
              <b>Choisir l’heure</b>
              <span>Dans l’un des cinq clubs, au prix affiché.</span>
            </li>
            <li>
              <b>Payer</b>
              <span>
                {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure creuse, {prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure pleine — carte ou avoir.
              </span>
            </li>
            <li>
              <b>Signer</b>
              <span>Les trois documents, à l’écran, en une minute.</span>
            </li>
            <li>
              <b>Entrer</b>
              <span>Votre QR ouvre la porte {REGLAGES_DEFAUT.qr_early_minutes} minutes avant l’heure.</span>
            </li>
          </ol>

          <ul className="acces__garanties">
            <li>Sans abonnement, sans engagement</li>
            <li>Annulation en avoir jusqu’à {REGLAGES_DEFAUT.cancel_min_hours} h avant</li>
            <li>Le même prix dans les cinq clubs</li>
          </ul>
        </aside>
      </div>
    </section>
  )
}
