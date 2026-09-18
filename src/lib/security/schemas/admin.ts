import 'server-only'

import { z } from 'zod'

import { ClubId, ParisInstant, SpaceId, Statut, Uuid } from './common'

/**
 * Back-office — spec-04 §8.3, cahier §3.9 et §10.
 */

/** POST /admin/slot-blocks — openapi #/components/schemas/SlotBlockInput */
export const SlotBlockBody = z.strictObject({
  club_id: ClubId,
  space_id: SpaceId,
  starts_at: ParisInstant,
  reason: z.string().trim().max(120).optional(),
})

export type SlotBlockBody = z.infer<typeof SlotBlockBody>

/**
 * PATCH /admin/settings — cahier §3.9.
 *
 * BORNES DURES. Un réglage n'est pas un champ libre : `capacity_per_slot` sans
 * borne haute, c'est un club qui vend 400 places dans une salle de deux ;
 * `hold_ttl_seconds` à 0, c'est un hold qui expire avant d'être affiché ;
 * `cancel_min_hours` à 10 000, c'est l'annulation supprimée sans qu'aucune ligne
 * de code ne change. Les bornes ci-dessous rendent ces états inécrivables, y
 * compris par une direction qui se trompe de zéro.
 */
export const SettingsPatchBody = z
  .strictObject({
    max_active_reservations: z.number().int().min(1).max(10).optional(),
    capacity_per_slot: z.number().int().min(1).max(10).optional(),
    hold_ttl_seconds: z.number().int().min(60).max(3600).optional(),
    cancel_min_hours: z.number().int().min(0).max(168).optional(),
    qr_early_minutes: z.number().int().min(0).max(60).optional(),
    offpeak_cents: z.number().int().min(0).max(100_000).optional(),
    peak_cents: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Aucun réglage fourni.' })

export type SettingsPatchBody = z.infer<typeof SettingsPatchBody>

/** POST /admin/coaches/{id}/suspend — direction seulement (cahier §10). */
export const SuspendBody = z.strictObject({
  reason: z.string().trim().min(3).max(200),
})

export type SuspendBody = z.infer<typeof SuspendBody>

/** GET /admin/reservations — mêmes filtres que l'export CSV (cahier §10). */
export const AdminReservationsQuery = z.strictObject({
  club_id: ClubId.optional(),
  space_id: SpaceId.optional(),
  coach_id: Uuid.optional(),
  status: Statut.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
})

export type AdminReservationsQuery = z.infer<typeof AdminReservationsQuery>

/**
 * GET /admin/audit — manager : son club seulement.
 *
 * `limit` est plafonné à 100 comme partout ailleurs. Un journal d'audit est
 * exactement le genre d'endpoint où un `?limit=100000` innocent devient une
 * fuite de masse et une facture de lecture.
 */
export const AuditQuery = z.strictObject({
  club_id: ClubId.optional(),
  action: z.string().trim().max(80).optional(),
  actor_id: Uuid.optional(),
  target_type: z.string().trim().max(40).optional(),
  target_id: z.string().trim().max(64).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
})

export type AuditQuery = z.infer<typeof AuditQuery>
