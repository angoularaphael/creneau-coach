import Link from 'next/link'

import {
  listerClubs,
  lireGrille,
  listerReservations,
  listerCoachsDeTest,
  type Creneau,
} from '@/lib/dal/back-office'
import {
  HEURES_CRENEAUX,
  formaterCentimes,
  tarifDeLHeure,
  type ClubId,
} from '@/domain/contrat'
import { exigeSessionBackOffice } from '@/lib/admin/garde'
import {
  actionBloquer,
  actionDebloquer,
  actionPoserHold,
  actionSupprimerReservation,
  actionCreerCoachDeTest,
} from './actions'
import { actionSortir } from './connexion/actions'
import { actionFermerStudio, actionOuvrirStudio } from './studio/actions'
import { studioActif } from '@/lib/studio/session'

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

/**
 * Secondes restantes avant la plus proche libération de place, ou `null`.
 * Sert la durée d'animation du liseré : le temps restant EST la donnée.
 */
function resteHold(c: Creneau): number | null {
  if (!c.hold_expire_le) return null
  const s = Math.round((new Date(c.hold_expire_le).getTime() - Date.now()) / 1000)
  return s > 0 ? s : null
}

/**
 * Libellé lu par un lecteur d'écran. L'état ne doit JAMAIS dépendre de la seule
 * couleur : ici il est dit en toutes lettres, avec le temps restant s'il y en a.
 */
function libelleCase(jour: string, hh: string, c: Creneau): string {
  const etats = { open: 'libre', full: 'complet', blocked: 'bloqué', past: 'passé' } as const
  const reste = resteHold(c)
  const suite = reste ? `, une place se libère dans ${Math.ceil(reste / 60)} minutes` : ''
  return `${jour} ${hh} h — ${c.taken} sur ${c.capacity}, ${etats[c.state]}${suite}`
}

/** Affichage seulement — jamais utilisé comme clé. */
const dateParis = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
})

/**
 * LES STATUTS EN FRANÇAIS, ET LEUR TON.
 *
 * La liste affichait `held`, `awaiting_signature`, `requires_action` — les
 * valeurs de la base, telles quelles. Un responsable de salle n'a pas à
 * apprendre le vocabulaire du moteur pour lire son planning du samedi.
 *
 * Le TON n'est pas décoratif : il dit s'il y a quelque chose À FAIRE.
 *   neutre  — c'est normal, ne rien faire ;
 *   attente — ça se débloquera seul, ou ça expirera ;
 *   alerte  — quelqu'un doit intervenir ;
 *   ok      — c'est réglé.
 *
 * Un libellé inconnu retombe sur la valeur brute plutôt que sur une case vide :
 * le jour où le moteur ajoute un statut, on le VOIT au lieu de croire qu'il n'y
 * a rien.
 */
const LIBELLE_STATUT: Record<string, string> = {
  held: 'Place tenue',
  awaiting_signature: 'À signer',
  confirmed: 'Confirmée',
  consumed: 'Séance passée',
  expired: 'Expirée',
  payment_failed: 'Paiement échoué',
  cancelled_credit: 'Annulée, avoir émis',
  no_show: 'Absent',
}

/* Valeurs relevées dans la base, pas devinées : `coach_payment_status`,
   `coach_signature_status`, `coach_deciplus_status`. Un premier jet écrit de
   mémoire disait `pending`, `refunded`, `credited` — aucun n'existe. Le repli
   sur la valeur brute l'a montré à l'écran dès la première réservation
   affichée : c'est à ça qu'il sert. */
const LIBELLE_PAIEMENT: Record<string, string> = {
  unpaid: 'Pas payé',
  paid: 'Payé',
  failed: 'Paiement échoué',
  waived_credit: 'Réglé par avoir',
}

const LIBELLE_SIGNATURE: Record<string, string> = {
  none: 'Pas encore signé',
  signed: 'Documents signés',
}

const LIBELLE_QR: Record<string, string> = {
  none: 'QR non généré',
  queued: 'QR en cours',
  granted: 'QR actif',
  revoked: 'QR retiré',
  error: 'QR en échec',
}

/** Les statuts où plus aucune action n'est possible. */
const ESTCLOS = new Set(['expired', 'consumed', 'cancelled_credit', 'no_show'])

type Ton = 'neutre' | 'attente' | 'alerte' | 'ok'

const tonStatut = (v: string): Ton =>
  v === 'confirmed' || v === 'consumed'
    ? 'ok'
    : v === 'payment_failed' || v === 'no_show'
      ? 'alerte'
      : v === 'held' || v === 'awaiting_signature'
        ? 'attente'
        : 'neutre'

const tonPaiement = (v: string): Ton =>
  v === 'paid' || v === 'waived_credit' ? 'ok' : v === 'failed' ? 'alerte' : 'attente'

const tonSignature = (v: string): Ton => (v === 'signed' ? 'ok' : 'attente')

const tonQr = (v: string): Ton =>
  v === 'granted' ? 'ok' : v === 'error' ? 'alerte' : v === 'queued' ? 'attente' : 'neutre'

export default async function BackOffice({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise, la compatibilité synchrone a été retirée.
  searchParams: Promise<{ club?: string; espace?: string; semaine?: string; resultat?: string }>
}) {
  const staff = await exigeSessionBackOffice()
  const studio = await studioActif()

  const params = await searchParams
  const tousLesClubs = await listerClubs()

  /**
   * LE PÉRIMÈTRE S'APPLIQUE ICI, AVANT TOUTE LECTURE.
   *
   * La page lisait `?club=` et servait le club demandé, quel qu'il soit. Le
   * cahier §20 l'interdit : « Le responsable de salle ne devra pas pouvoir
   * consulter les données des autres clubs. »
   *
   * On réduit donc la LISTE elle-même. C'est volontaire, et plus sûr que de
   * filtrer les requêtes une par une : un club absent de la liste ne peut pas
   * être sélectionné, ne peut pas apparaître dans un lien, et ne peut pas être
   * atteint en bidouillant l'URL puisque la ligne suivante ne le trouvera pas.
   * Filtrer au niveau des requêtes marche jusqu'au jour où quelqu'un ajoute une
   * requête et oublie le filtre. Réduire la source ne s'oublie pas.
   */
  const clubs = staff.clubId
    ? tousLesClubs.filter((c) => c.id === staff.clubId)
    : tousLesClubs

  const demande = params.club
  const club = clubs.find((c) => c.id === demande) ?? clubs[0]

  // Un responsable qui demande explicitement un autre club reçoit un refus, pas
  // un repli silencieux sur le sien : un repli masquerait la tentative.
  if (demande && staff.clubId && demande !== staff.clubId) {
    return (
      <p className="bo__vide-texte">
        Ce club n’est pas dans votre périmètre. Vous avez accès au club{' '}
        <strong>{staff.clubId}</strong>.
      </p>
    )
  }

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

  // Le prix vient du serveur, jamais d'un calcul ici (cahier §1.4).
  const prixDeLHeure = new Map<number, number>()
  for (const c of grille) {
    prixDeLHeure.set(Number(murParis(new Date(c.starts_at)).heure), c.amount_cents)
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
      {/* Le bandeau dit QUI est connecté ET JUSQU'OÙ il voit. La seconde
          moitié n'est pas décorative : un responsable de salle doit pouvoir
          constater d'un coup d'œil qu'il est bien dans son club et nulle part
          ailleurs — et une direction doit savoir qu'elle voit tout.

          C'EST UN `div`, ET CE N'EST PAS UN DÉTAIL DE STYLE.

          C'était un `<p>` contenant trois `<form>`. Or `<p>` n'accepte que du
          contenu de phrasé, et un formulaire est du contenu de flux : le
          navigateur REFERME le paragraphe tout seul avant le premier `<form>`.
          L'arbre rendu côté client cesse alors de ressembler à celui du
          serveur, et React refuse d'hydrater — toute la page perd ses
          interactions, pas seulement ce bandeau.

          La règle est générale : dès qu'un conteneur porte un bouton, un
          formulaire ou une liste, ce n'est pas un paragraphe. */}
      <div className="bo__bandeau" data-studio={studio}>
        <strong>
          {studio ? 'Studio TEST' : staff.role === 'salle' ? 'Responsable de salle' : 'Direction'}
        </strong>
        <span>
          Connecté en tant que <strong>{staff.libelle}</strong>
          {staff.role === 'super_admin' ? ' (super-admin)' : ''}.{' '}
          {staff.clubId
            ? `Périmètre : le club ${staff.clubId} uniquement.`
            : 'Périmètre : les cinq clubs.'}
          {studio ? ' Paiements Payplug en TEST sur ce navigateur.' : ''}
        </span>
        <span className="bo__actions">
          {studio ? (
            <form action={actionFermerStudio}>
              <button className="bo__bouton bo__bouton--discret" type="submit">
                Éteindre le studio
              </button>
            </form>
          ) : (
            <form action={actionOuvrirStudio}>
              <button className="bo__bouton" type="submit">
                Mode studio
              </button>
            </form>
          )}
          <Link className="bo__bouton bo__bouton--discret" href="/admin/studio">
            Comment ça marche
          </Link>
          <form action={actionSortir} className="bo__sortir">
            <button className="bo__bouton bo__bouton--discret" type="submit">
              Sortir
            </button>
          </form>
        </span>
      </div>

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
                <th key={nom} scope="col" data-samedi={i === 5}>
                  {nom}
                  <b>{dateParis.format(decaler(lundi, i))}</b>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEURES_CRENEAUX.map((h) => {
              const hh = String(h).padStart(2, '0')
              return (
                <tr key={h}>
                  <th
                    scope="row"
                    className="bo__heure"
                    data-tarif={tarifDeLHeure(h)}
                    title={tarifDeLHeure(h) === 'peak' ? 'Heure pleine' : 'Heure creuse'}
                  >
                    {hh}:00
                    <small>{formaterCentimes(prixDeLHeure.get(h) ?? 0)}</small>
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
                            data-samedi={i === 5}
                            data-prix={formaterCentimes(c.amount_cents)}
                            disabled={passe}
                            title={titre}
                            aria-label={libelleCase(nom, hh, c)}
                          >
                            {bloque ? '×' : `${c.taken}/${c.capacity}`}
                            {resteHold(c) ? (
                              <span
                                className="bo__hold"
                                style={
                                  {
                                    '--reste': `${resteHold(c)}s`,
                                    '--proportion': String(
                                      Math.min(1, (resteHold(c) ?? 0) / 600),
                                    ),
                                  } as React.CSSProperties
                                }
                              />
                            ) : null}
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
          <i className="bo__puce" style={{ background: 'var(--accent)', opacity: 0.95 }} /> heure
          pleine
        </span>
        <span>
          <i className="bo__puce" style={{ background: 'var(--accent)', opacity: 0.3 }} /> heure
          creuse
        </span>
        <span>
          <i className="bo__puce" style={{ background: 'var(--full)' }} /> complet
        </span>
        <span>× bloqué — éducative ou back-office</span>
        <span>
          <i
            className="bo__puce"
            style={{ background: 'var(--accent)', height: '2px', borderRadius: 0 }}
          />{' '}
          hold en cours : le liseré se vide, la place se libère à la fin
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
            <ul className="bo__resas">
              {reservations.map((r) => (
                <li key={r.id} className="bo__resa">
                  <div className="bo__resa__quand">
                    <b>{dateParis.format(new Date(r.starts_at))}</b>
                    <span>
                      {murParis(new Date(r.starts_at)).heure}h · {r.space_id}
                    </span>
                  </div>

                  {/* LE NOM, EN PREMIER ET EN GRAND.
                      C'est ce qu'un responsable de salle cherche : qui vient
                      samedi à 14h. Il lisait un UUID. */}
                  <div className="bo__resa__qui">
                    <b>{r.coach_nom ?? 'Nom non renseigné'}</b>
                    {r.coach_statut === 'suspended' ? (
                      <span className="bo__etat" data-ton="alerte">
                        Compte suspendu
                      </span>
                    ) : null}
                  </div>

                  {/* Une réservation close ne réclame plus rien : ses états
                      passent en sourdine. Sans ça, six réservations expirées
                      affichent douze alertes qu'on ne peut plus traiter — et
                      on apprend à ignorer les alertes. */}
                  <div className="bo__resa__etats" data-close={ESTCLOS.has(r.status)}>
                    <span className="bo__etat" data-ton={tonStatut(r.status)}>
                      {LIBELLE_STATUT[r.status] ?? r.status}
                    </span>
                    <span className="bo__etat" data-ton={tonPaiement(r.payment_status)}>
                      {LIBELLE_PAIEMENT[r.payment_status] ?? r.payment_status}
                    </span>
                    <span className="bo__etat" data-ton={tonSignature(r.signature_status)}>
                      {LIBELLE_SIGNATURE[r.signature_status] ?? r.signature_status}
                    </span>
                    <span className="bo__etat" data-ton={tonQr(r.deciplus_job_status)}>
                      {LIBELLE_QR[r.deciplus_job_status] ?? r.deciplus_job_status}
                    </span>
                  </div>

                  <form action={actionSupprimerReservation} className="bo__resa__action">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="bo__bouton bo__bouton--discret" title="Supprimer (essai)">
                      Supprimer
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
