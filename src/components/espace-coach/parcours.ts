/**
 * OÙ EN EST UNE RÉSERVATION, ET QUE FAIRE ENSUITE — la lecture COACH du statut.
 *
 * Le moteur connaît huit statuts ; un coach ne connaît que trois gestes :
 * payer, signer, entrer. Tout l'espace se lit à travers ces trois gestes, et
 * chaque réservation n'en propose qu'UN à la fois — le prochain. Deux boutons
 * de même poids sur une carte, c'est demander au coach de deviner l'ordre.
 *
 * Ce fichier ne décide RIEN de métier : il traduit un statut déjà décidé par la
 * base. La seule règle « horaire » qu'il porte (l'option échue) est la même que
 * celle de la page réservation, calculée au même endroit pour que la liste et
 * la fiche ne puissent pas se contredire.
 */

import type { Reservation } from '@/lib/api/types'
import { FUSEAU_METIER, REGLAGES_DEFAUT, estClubId, tarifDeLHeure } from '@/domain/contrat'
import { nomClub } from '@/lib/clubs'
import { CLUBS_VERITE, adresseEnLigne } from '@/lib/seo/verite'
import { cheminClub, getClubByApiId } from '@/lib/seo/routes'

export type Ton = 'decision' | 'pret' | 'passe' | 'eteint' | 'alerte'

/** Les statuts qui occupent une des places actives (cahier : 3 au maximum). */
const ACTIFS = new Set(['held', 'awaiting_signature', 'confirmed'])

/** Une option dont le délai est passé n'est plus une place gardée, même si la base ne l'a pas encore basculée. */
export function optionEchue(r: Reservation, maintenant: number): boolean {
  return (
    r.status === 'held' &&
    Boolean(r.hold_expires_at) &&
    new Date(String(r.hold_expires_at)).getTime() <= maintenant
  )
}

/** À venir = active, pas terminée, pas une option échue. */
export function estAVenir(r: Reservation, maintenant: number): boolean {
  return ACTIFS.has(r.status) && new Date(r.ends_at).getTime() > maintenant && !optionEchue(r, maintenant)
}

/** « Minimes », « Saint-Cyprien » : le nom du club sans la marque, qui se répète partout ailleurs. */
export function clubCourt(id: string): string {
  return nomClub(id).replace(/^Boxing Center\s+/, '')
}

export function adresseClub(id: string): string | null {
  return estClubId(id) ? adresseEnLigne(CLUBS_VERITE[id]) : null
}

/** L'itinéraire : une recherche Google Maps sur l'adresse publiée, rien de plus. */
export function lienItineraire(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Boxing Center, ${adresse}`)}`
}

/** La page publique du club, celle où l'on réserve. `/clubs` si le club est inconnu. */
export function cheminReserverClub(id: string): string {
  const page = getClubByApiId(id)
  return page ? cheminClub(page.slug) : '/clubs'
}

/** L'étiquette courte d'une pastille. La phrase longue reste `libelleStatut`. */
export function pastille(r: Reservation, maintenant: number): { texte: string; ton: Ton } {
  if (optionEchue(r, maintenant)) return { texte: 'Délai écoulé', ton: 'eteint' }
  switch (r.status) {
    case 'held':
      return { texte: 'À payer', ton: 'decision' }
    case 'awaiting_signature':
      return { texte: 'À signer', ton: 'decision' }
    case 'confirmed':
      return new Date(r.ends_at).getTime() <= maintenant
        ? { texte: 'Séance passée', ton: 'passe' }
        : { texte: 'Confirmée', ton: 'pret' }
    case 'consumed':
      return { texte: 'Séance faite', ton: 'passe' }
    case 'cancelled_credit':
      return { texte: 'Annulée · avoir émis', ton: 'eteint' }
    case 'expired':
      return { texte: 'Délai écoulé', ton: 'eteint' }
    case 'payment_failed':
      return { texte: 'Paiement refusé', ton: 'alerte' }
    case 'no_show':
      return { texte: 'Non honorée', ton: 'eteint' }
    default:
      return { texte: r.status, ton: 'eteint' }
  }
}

export type EtatEtape = 'fait' | 'courant' | 'avenir' | 'rompu'

/** Les trois gestes, et l'état de chacun pour CETTE réservation. */
export function etapes(r: Reservation, maintenant: number): [EtatEtape, EtatEtape, EtatEtape] {
  if (optionEchue(r, maintenant) || r.status === 'expired' || r.status === 'payment_failed') {
    return ['rompu', 'avenir', 'avenir']
  }
  switch (r.status) {
    case 'held':
      return ['courant', 'avenir', 'avenir']
    case 'awaiting_signature':
      return ['fait', 'courant', 'avenir']
    case 'confirmed':
      return new Date(r.ends_at).getTime() <= maintenant ? ['fait', 'fait', 'fait'] : ['fait', 'fait', 'courant']
    case 'consumed':
    case 'no_show':
      return ['fait', 'fait', 'fait']
    case 'cancelled_credit':
      // Annulée après paiement : le paiement a eu lieu (il est devenu un avoir),
      // la suite est interrompue.
      return [r.payment_status === 'unpaid' ? 'rompu' : 'fait', r.signature_status === 'signed' ? 'fait' : 'rompu', 'rompu']
    default:
      return ['avenir', 'avenir', 'avenir']
  }
}

export type Action = {
  readonly libelle: string
  readonly href: string
  /** Ouvre un document dans un nouvel onglet (l'attestation PDF). */
  readonly nouvelOnglet?: boolean
  readonly ton: 'decision' | 'neutre'
}

/** LE prochain geste. Un seul. `null` quand il n'y a vraiment rien à faire. */
export function prochaineAction(r: Reservation, maintenant: number): Action | null {
  const fiche = `/espace-coach/reservations/${r.id}`
  if (optionEchue(r, maintenant) || r.status === 'expired' || r.status === 'payment_failed') {
    return { libelle: 'Reprendre une heure', href: cheminReserverClub(r.club_id), ton: 'neutre' }
  }
  switch (r.status) {
    case 'held':
      return { libelle: 'Payer', href: fiche, ton: 'decision' }
    case 'awaiting_signature':
      return { libelle: 'Signer', href: `${fiche}/signature`, ton: 'decision' }
    case 'confirmed':
      return new Date(r.ends_at).getTime() <= maintenant
        ? { libelle: 'Voir', href: fiche, ton: 'neutre' }
        : { libelle: 'Mon QR', href: `${fiche}/qr`, ton: 'decision' }
    case 'consumed':
      return r.signature_status === 'signed'
        ? { libelle: 'Attestation', href: `/documents/attestation/${r.id}`, nouvelOnglet: true, ton: 'neutre' }
        : { libelle: 'Voir', href: fiche, ton: 'neutre' }
    case 'cancelled_credit':
      return { libelle: 'Utiliser l’avoir', href: cheminReserverClub(r.club_id), ton: 'neutre' }
    default:
      return { libelle: 'Voir', href: fiche, ton: 'neutre' }
  }
}

/**
 * La date limite d'annulation avec avoir. Le délai réel vit en base
 * (`coach_settings.cancel_min_hours`) ; l'affichage reprend la valeur par
 * défaut, exactement comme les pages publiques et les CGV qui l'annoncent.
 */
export function limiteAnnulation(r: Reservation): number {
  return new Date(r.starts_at).getTime() - REGLAGES_DEFAUT.cancel_min_hours * 3_600_000
}

const F_HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_METIER, hour: 'numeric', hourCycle: 'h23' })

/**
 * Le tarif de l'heure, d'après l'heure de début À PARIS — la même grille que
 * le moteur (`tarifDeLHeure`). Jamais déduit du montant : un prix changé en
 * back-office ne doit pas faire passer une heure creuse pour une heure pleine.
 */
export function libelleTarif(r: Reservation): string {
  const h = Number.parseInt(F_HEURE_PARIS.format(new Date(r.starts_at)), 10)
  return tarifDeLHeure(h) === 'peak' ? 'Heure pleine' : 'Heure creuse'
}
