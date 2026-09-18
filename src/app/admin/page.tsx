import Link from 'next/link'

import {
  listerClubs,
  lireGrille,
  listerReservations,
  listerCoachsDeTest,
  type Creneau,
} from '@/lib/dal/back-office'
import { HEURES_CRENEAUX, formaterCentimes, type ClubId } from '@/domain/contrat'
import {
  actionBloquer,
  actionDebloquer,
  actionPoserHold,
  actionSupprimerReservation,
  actionCreerCoachDeTest,
} from './actions'

export const dynamic = 'force-dynamic'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

/** Les dates de la grille sont des jours calendaires Paris, pas des instants. */
function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Lundi de la semaine contenant `iso`. Le dimanche est fermé : la semaine va lundi→samedi.
 *
 * `iso` vient de l'URL, donc de l'extérieur. Une valeur vide ou fantaisiste
 * produisait une `Invalid Date` et une erreur 500 — un paramètre de requête ne
 * doit jamais pouvoir faire tomber une page. On retombe sur aujourd'hui.
 */
function lundiDeLaSemaine(iso: string | undefined): Date {
  const candidat = /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? new Date(`${iso}T12:00:00Z`) : null
  const d =
    candidat && !Number.isNaN(candidat.getTime())
      ? candidat
      : new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`)
  const jour = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (jour - 1))
  return d
}

function decaler(d: Date, jours: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + jours)
  return c
}

/**
 * Décomposition d'un instant en date et heure murales de Paris.
 *
 * On passe par `formatToParts` et JAMAIS par `format()` : en `fr-FR`, une heure
 * se rend « 10 h », espace et « h » compris. Utilisée comme clé d'index, cette
 * chaîne ne correspondait à rien et la grille s'affichait vide alors que les 54
 * créneaux étaient bien là. Une clé de données ne doit jamais dépendre d'une
 * locale d'affichage.
 *
 * Et la date se lit dans le fuseau de Paris, pas en UTC : `toISOString()` donne
 * le jour UTC. Nos créneaux vont de 10 h à 18 h, donc les deux coïncident
 * aujourd'hui — mais c'est un hasard d'horaires, pas une garantie.
 */
const partiesParis = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

function murParis(instant: Date): { jour: string; heure: string } {
  const p = Object.fromEntries(
    partiesParis.formatToParts(instant).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: p.hour ?? '00' }
}

/** Affichage seulement — jamais utilisé comme clé. */
const dateParis = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
})

export default async function BackOffice({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise, la compatibilité synchrone a été retirée.
  searchParams: Promise<{ club?: string; espace?: string; semaine?: string; resultat?: string }>
}) {
  const params = await searchParams
  const clubs = await listerClubs()

  const club = clubs.find((c) => c.id === params.club) ?? clubs[0]
  if (!club) {
    return (
      <p className="bo__vide-texte">
        Aucun club en base. Lance <code>npm run db:migrate</code> pour appliquer le seed.
      </p>
    )
  }

  const espace = club.spaces.find((s) => s.id === params.espace) ?? club.spaces[0]
  const lundi = lundiDeLaSemaine(params.semaine)
  const samedi = decaler(lundi, 5)
  const du = isoJour(lundi)
  const au = isoJour(samedi)

  const [grille, reservations, coachs] = await Promise.all([
    lireGrille(club.id as ClubId, espace?.id ?? null, du, au),
    listerReservations(club.id as ClubId, du, au),
    listerCoachsDeTest(),
  ])

  // Indexé par `jour|heure` — la grille SQL renvoie une liste à plat.
  const parCase = new Map<string, Creneau>()
  for (const c of grille) {
    const { jour, heure } = murParis(new Date(c.starts_at))
    parCase.set(`${jour}|${heure}`, c)
  }

  const lien = (p: Record<string, string>) => {
    const q = new URLSearchParams({ club: club.id, espace: espace?.id ?? '', semaine: du, ...p })
    return `/admin?${q.toString()}`
  }

  const actifs = reservations.filter((r) =>
    ['held', 'awaiting_signature', 'confirmed'].includes(r.status),
  )

  return (
    <>
      <p className="bo__bandeau">
        <strong>Banc d’essai</strong>
        <span>
          Back-office ouvert sans mot de passe, le temps d’éprouver le moteur. Il lit la base avec
          la clé <code>service_role</code>, qui ignore la RLS — il refuse donc de répondre en
          production. L’authentification staff (manager de salle / direction) reste à brancher.
        </span>
      </p>

      {params.resultat ? (
        <p
          className="bo__verdict"
          role="status"
          data-ok={params.resultat === 'hold_ok'}
        >
          {params.resultat === 'hold_ok'
            ? 'Hold créé — la place est bloquée 10 minutes.'
            : `Refus du moteur : ${params.resultat}`}
        </p>
      ) : null}

      <h1>Planning — {club.name}</h1>
      <p className="bo__sous">
        Semaine du {dateParis.format(lundi)} au {dateParis.format(samedi)} · {grille.length} créneaux
        · {actifs.length} réservation{actifs.length > 1 ? 's' : ''} active
        {actifs.length > 1 ? 's' : ''}
      </p>

      <div className="bo__filtres">
        <div className="bo__groupe">
          <span className="bo__legende">Club</span>
          <div className="bo__onglets">
            {clubs.map((c) => (
              <Link
                key={c.id}
                className="bo__onglet"
                aria-current={c.id === club.id}
                href={`/admin?club=${c.id}&semaine=${du}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="bo__groupe">
          <span className="bo__legende">Espace</span>
          <div className="bo__onglets">
            {club.spaces.map((s) => (
              <Link
                key={s.id}
                className="bo__onglet"
                aria-current={s.id === espace?.id}
                href={lien({ espace: s.id })}
              >
                {s.name} · {s.capacity} pl.
              </Link>
            ))}
          </div>
        </div>

        <div className="bo__groupe">
          <span className="bo__legende">Semaine</span>
          <div className="bo__onglets">
            <Link className="bo__onglet" href={lien({ semaine: isoJour(decaler(lundi, -7)) })}>
              ← précédente
            </Link>
            <Link className="bo__onglet" href={lien({ semaine: isoJour(new Date()) })}>
              aujourd’hui
            </Link>
            <Link className="bo__onglet" href={lien({ semaine: isoJour(decaler(lundi, 7)) })}>
              suivante →
            </Link>
          </div>
        </div>
      </div>

      <div className="bo__defilement">
        <table className="bo__grille">
          <caption className="bo__legende" style={{ captionSide: 'bottom', padding: '0.5rem' }}>
            Chaque case indique le nombre de places prises sur la capacité de l’espace.
          </caption>
          <thead>
            <tr>
              <th scope="col">Heure</th>
              {JOURS.map((nom, i) => (
                <th key={nom} scope="col">
                  {nom}
                  <br />
                  {dateParis.format(decaler(lundi, i))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEURES_CRENEAUX.map((h) => {
              const hh = String(h).padStart(2, '0')
              return (
                <tr key={h}>
                  <th scope="row" className="bo__heure">
                    <b>
                      {hh}:00
                    </b>
                    <span>{h >= 12 && h <= 13 ? 'pleine' : h >= 17 ? 'pleine' : 'creuse'}</span>
                  </th>
                  {JOURS.map((nom, i) => {
                    // Même dérivation que pour les créneaux : une seule définition du jour.
                    const jour = murParis(decaler(lundi, i)).jour
                    const c = parCase.get(`${jour}|${hh}`)
                    if (!c) return <td key={nom} className="bo__vide" />

                    const bloque = c.state === 'blocked'
                    const passe = c.state === 'past'
                    const action = bloque ? actionDebloquer : actionBloquer
                    const titre = passe
                      ? 'Créneau passé'
                      : bloque
                        ? 'Débloquer ce créneau'
                        : 'Bloquer ce créneau'

                    return (
                      <td key={nom}>
                        <form action={action}>
                          <input type="hidden" name="club" value={c.club_id} />
                          <input type="hidden" name="space" value={c.space_id} />
                          <input type="hidden" name="starts_at" value={c.starts_at} />
                          <button
                            className="bo__case"
                            data-etat={c.state}
                            disabled={passe}
                            title={titre}
                            aria-label={`${nom} ${hh}h — ${c.taken} sur ${c.capacity} — ${c.state}`}
                          >
                            <span className="bo__pastille">
                              {bloque ? '×' : `${c.taken}/${c.capacity}`}
                            </span>
                            <span className="bo__prix">{formaterCentimes(c.amount_cents)}</span>
                          </button>
                        </form>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="bo__legendes">
        <span>
          <i className="bo__puce" style={{ background: 'var(--ok)' }} /> libre
        </span>
        <span>
          <i className="bo__puce" style={{ background: 'var(--full)' }} /> complet
        </span>
        <span>
          <i className="bo__puce" style={{ background: 'var(--blocked)' }} /> bloqué (× — éducative
          ou back-office)
        </span>
        <span>
          <i className="bo__puce" style={{ background: 'var(--past)' }} /> passé
        </span>
        <span>Un clic sur une case bloque ou débloque le créneau.</span>
      </p>

      <div className="bo__panneaux">
        <section className="bo__panneau">
          <h2>Poser un hold</h2>
          {coachs.length === 0 ? (
            <p className="bo__vide-texte">
              Aucun coach en base. Crée-en un ci-dessous pour éprouver la capacité et la limite de
              trois réservations actives.
            </p>
          ) : (
            <form action={actionPoserHold} className="bo__form">
              <input type="hidden" name="club" value={club.id} />
              <input type="hidden" name="space" value={espace?.id ?? ''} />
              <input type="hidden" name="semaine" value={du} />
              <select name="coach" className="bo__champ" aria-label="Coach">
                {coachs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                    {c.status !== 'active' ? ` (${c.status})` : ''}
                  </option>
                ))}
              </select>
              <select name="starts_at" className="bo__champ" aria-label="Créneau">
                {grille
                  .filter((c) => c.state === 'open')
                  .slice(0, 60)
                  .map((c) => (
                    <option key={c.starts_at} value={c.starts_at}>
                      {dateParis.format(new Date(c.starts_at))} · {murParis(new Date(c.starts_at)).heure}
                      h · {formaterCentimes(c.amount_cents)}
                    </option>
                  ))}
              </select>
              <button className="bo__bouton">Réserver</button>
            </form>
          )}
          <p className="bo__vide-texte" style={{ marginTop: '0.75rem' }}>
            Passe par <code>coach_create_hold</code>, la vraie fonction : verrou par créneau, siège
            attribué, prix calculé serveur, limite de 3 actives.
          </p>
        </section>

        <section className="bo__panneau">
          <h2>Coachs d’essai</h2>
          <form action={actionCreerCoachDeTest} className="bo__form">
            <input
              className="bo__champ"
              name="prenom"
              placeholder="Prénom"
              aria-label="Prénom du coach d’essai"
            />
            <button className="bo__bouton bo__bouton--discret">Créer</button>
          </form>
          <ul className="bo__liste" style={{ marginTop: '0.75rem' }}>
            {coachs.map((c) => (
              <li key={c.id} className="bo__ligne">
                <span>{c.nom}</span>
                <span
                  className="bo__etiquette"
                  style={{ color: c.status === 'active' ? 'var(--ok)' : 'var(--warn)' }}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bo__panneau">
          <h2>Réservations de la semaine</h2>
          {reservations.length === 0 ? (
            <p className="bo__vide-texte">Aucune réservation sur cette semaine.</p>
          ) : (
            <ul className="bo__liste">
              {reservations.map((r) => (
                <li key={r.id} className="bo__ligne">
                  <span>
                    {dateParis.format(new Date(r.starts_at))} ·{' '}
                    {murParis(new Date(r.starts_at)).heure}h · {r.space_id}
                  </span>
                  <span className="bo__etiquette">{r.status}</span>
                  <span className="bo__etiquette">{r.payment_status}</span>
                  <form action={actionSupprimerReservation}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="bo__bouton bo__bouton--discret" title="Supprimer (essai)">
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="bo__vide-texte" style={{ marginTop: '0.75rem' }}>
            Ni PDF de signature, ni jeton QR, ni identifiant Deciplus : le cahier §10 les interdit
            au personnel de salle. Les colonnes sont choisies une par une, jamais&nbsp;
            <code>select *</code>.
          </p>
        </section>
      </div>
    </>
  )
}
