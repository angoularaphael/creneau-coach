import 'server-only'

import { z } from 'zod'

import { ClubId, ParisInstant, SpaceId, Statut, Uuid } from './common'

/**
 * Schémas des réservations — spec-04 §8.3.
 *
 * ═══ POURQUOI `z.strictObject` PARTOUT SUR LES CORPS ENTRANTS ═══
 * Ce n'est pas du confort, c'est le test §3.3 du cahier : « Prix hold : le client
 * ne peut pas forcer 10 € sur un créneau 15 € ». Avec un objet permissif, un
 * `amount_cents: 1000` glissé dans le corps est SILENCIEUSEMENT IGNORÉ. Ça
 * marche — mais on ne le VOIT pas, et le jour où quelqu'un ajoute un `...body`
 * quelque part, la faille est ouverte sans qu'une seule ligne de sécurité ait
 * changé. Avec `strictObject`, c'est un 400 immédiat et une ligne d'audit.
 */

/** POST /reservations — openapi.yaml#/components/schemas/CreateReservation */
export const CreateReservationBody = z.strictObject({
  club_id: ClubId,
  space_id: SpaceId,
  starts_at: ParisInstant,
})
// Absents, donc REFUSÉS : amount_cents, currency, seat, status, coach_id.
// Le prix est calculé serveur, dans `coach_create_hold`, depuis `coach_tariffs`.

export type CreateReservationBody = z.infer<typeof CreateReservationBody>

/** POST /reservations/{id}/checkout */
export const CheckoutBody = z.strictObject({
  provider: z.enum(['payplug', 'paypal', 'credit']),
})

export type CheckoutBody = z.infer<typeof CheckoutBody>

/**
 * POST /reservations/{id}/cancel — pas de corps au contrat.
 *
 * `strictObject({})` refuse toute clé. Un client qui enverrait
 * `{"reason":"…"}` se ferait refuser, ce qui est le comportement voulu : le
 * motif d'annulation est décidé serveur (`'coach'` / `'direction'` /
 * `'hold_expired'`), pas dicté par l'appelant.
 */
export const CancelBody = z.strictObject({})

export type CancelBody = z.infer<typeof CancelBody>

/** GET /reservations */
export const ListReservationsQuery = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: Statut.optional(),
  // `club_id` et `coach_id` sont des filtres de STAFF. Les accepter ici ne donne
  // aucun droit : l'autorisation est refaite dans la DAL, et un manager qui
  // demande `?club_id=portet` depuis Minimes reçoit 404 (cahier §13.2).
  // zod dit « la forme est valide », jamais « tu as le droit ».
  club_id: ClubId.optional(),
  coach_id: Uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
})

export type ListReservationsQuery = z.infer<typeof ListReservationsQuery>

/** GET /clubs/{id}/slots — grille publique, sans session. */
export const SlotsQuery = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
  space_id: SpaceId.optional(),
})

export type SlotsQuery = z.infer<typeof SlotsQuery>
