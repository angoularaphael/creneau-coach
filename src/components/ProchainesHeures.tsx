import Link from 'next/link'

import { formatCents } from '@/lib/api/client'
import { prochainesHeuresLibres } from '@/lib/dal/prochaines'
import { cheminClub, getClubByApiId } from '@/lib/seo'
import { CLUBS_VERITE } from '@/lib/seo/verite'

/**
 * « LIBRE MAINTENANT » — la vraie disponibilité, dès l'arrivée sur le site.
 *
 * Une vitrine dit « réservez » ; celle-ci montre QUOI réserver : les trois
 * prochaines heures libres de chaque club, lues dans la même grille que la page
 * du club. Une heure se touche et s'ouvre directement sur sa fiche de
 * réservation (`?creneau=`), sans chercher dans un planning.
 *
 * Rendu côté serveur, dans le HTML : un moteur de réponse qui lit la page lit
 * aussi des heures et des prix réels, datés du jour.
 */

const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
const fmtJour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' })
const cleJour = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

function libelleJour(iso: string): string {
  const d = new Date(iso)
  const cle = cleJour(d)
  if (cle === cleJour(new Date())) return 'Aujourd’hui'
  if (cle === cleJour(new Date(Date.now() + 86_400_000))) return 'Demain'
  const j = fmtJour.format(d)
  return j.charAt(0).toUpperCase() + j.slice(1)
}

/** « Portet » et pas « Portet-sur-Garonne » : la commune entière est écrite juste dessous. */
function nomCourt(nom: string): string {
  return nom.replace('Boxing Center Toulouse ', '').replace('Boxing Center ', '').replace(/-sur-.*$/, '')
}

/** Le titre change d'une page à l'autre : deux pages ne partagent jamais un H2. */
export async function ProchainesHeures({
  titre = 'Les prochaines heures libres, club par club.',
}: { titre?: string } = {}) {
  const clubs = await prochainesHeuresLibres(3)
  if (clubs.length === 0) return null

  return (
    <section className="section libre" aria-labelledby="libre-titre">
      <div className="libre__tete">
        <p className="libre__direct">
          <span className="libre__pouls" aria-hidden="true" />
          En direct
        </p>
        <h2 id="libre-titre">{titre}</h2>
        <p className="libre__sous">
          Touchez une heure : elle s’ouvre, prix affiché, prête à être réservée.
        </p>
      </div>

      <ul className="libre__clubs">
        {clubs.map(({ clubId, heures, totalLibres }) => {
          const fiche = getClubByApiId(clubId)
          if (!fiche) return null
          const chemin = cheminClub(fiche.slug)
          const verite = CLUBS_VERITE[clubId]
          return (
            <li key={clubId} className="libre__club">
              <Link href={chemin} className="libre__nom">
                <span>{nomCourt(verite.nom)}</span>
                <small>{verite.ville}</small>
              </Link>
              {heures.length ? (
                <ul className="libre__heures">
                  {heures.map((h, i) => {
                    // Le jour s'écrit une fois, au-dessus de ses heures — pas
                    // trois « Aujourd'hui » à la suite.
                    const jour = libelleJour(h.startsAt)
                    const precedente = heures[i - 1]
                    const nouveauJour = !precedente || libelleJour(precedente.startsAt) !== jour
                    return (
                      <li key={h.startsAt}>
                        {nouveauJour ? <p className="libre__jour">{jour}</p> : null}
                        <Link
                          className="libre__heure"
                          data-tarif={h.tariff}
                          href={`${chemin}?${new URLSearchParams({ space_id: h.spaceId, creneau: h.startsAt }).toString()}`}
                          aria-label={`Réserver ${jour.toLowerCase()} à ${fmtHeure.format(new Date(h.startsAt))}, ${nomCourt(verite.nom)}, ${formatCents(h.amountCents)}`}
                        >
                          <b>
                            {fmtHeure.format(new Date(h.startsAt))}
                            <span aria-hidden="true"> – {fmtHeure.format(new Date(h.endsAt))}</span>
                          </b>
                          <span className="libre__prix">{formatCents(h.amountCents).replace(',00', '')}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="libre__plein">Complet ces trois jours — la semaine suivante est ouverte.</p>
              )}
              <Link href={chemin} className="libre__tout">
                {totalLibres > heures.length ? `+ ${totalLibres - heures.length} autres heures` : 'Tout le planning'}
                <span aria-hidden="true"> →</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
