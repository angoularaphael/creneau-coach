import 'server-only'

import { z } from 'zod'

import { CLUB_IDS, STATUTS } from '@/domain/contrat'

/**
 * Briques zod 4 communes — spec-04 §8.
 *
 * ═══ CE QUI A CHANGÉ DEPUIS ZOD 3, ET QUI MORD ═══
 *  · `z.string().email()` → `z.email()` ; `.uuid()` → `z.uuid()` ; les formes en
 *    méthode existent encore mais sont DÉPRÉCIÉES.
 *  · `{ message: "…" }` → `{ error: "…" }` ; `invalid_type_error` et
 *    `required_error` sont SUPPRIMÉS, pas dépréciés.
 *  · `.strict()` → `z.strictObject()`.
 *  · `z.coerce.*` : « A missing key on an object schema with a `z.coerce.*` field
 *    now errors. Use `.default()` to declare the fallback explicitly. » C'est LE
 *    piège de ce fichier : sans `.default(50)`, une requête sans `?limit=` échoue
 *    au lieu de prendre le défaut d'`openapi.yaml`.
 *  · La précédence des error maps a changé : schema-level gagne désormais.
 */

/** openapi.yaml#/components/schemas/ClubId */
export const ClubId = z.enum(CLUB_IDS)

/**
 * `space_id` est un slug libre au contrat. L'appartenance `(club_id, space_id)`
 * est vérifiée EN BASE (`coach_spaces`, clé étrangère composite), pas ici.
 * zod valide la FORME, la base valide l'EXISTENCE. Recopier la liste des espaces
 * ici créerait une seconde source de vérité qui dériverait au premier espace
 * ajouté par le back-office.
 */
export const SpaceId = z
  .string()
  .regex(/^[a-z0-9-]{2,32}$/, { error: 'space_id invalide' })

/**
 * Le contrat envoie toujours un décalage explicite : `2026-09-22T11:00:00+02:00`.
 * On l'EXIGE. Un datetime local est ambigu à la bascule d'heure d'été, et le
 * cahier §1.6 impose l'heure serveur Europe/Paris comme référence unique.
 */
export const ParisInstant = z.iso.datetime({ offset: true })

export const IsoDate = z.iso.date() // 'YYYY-MM-DD'

/** Cahier §1.4 : tous les identifiants sont des UUID v4. */
export const Uuid = z.uuid({ version: 'v4' })

export const IdempotencyKey = Uuid

export const Statut = z.enum(STATUTS)

/**
 * `limit` : integer 1..100, défaut 50 (openapi.yaml). Le `.default(50)` n'est pas
 * décoratif — voir l'avertissement sur `z.coerce` en tête de fichier.
 */
export const Pagination = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
})

/**
 * Lit les paramètres de requête sous forme d'objet plat.
 *
 * `searchParams.get()` rend la PREMIÈRE valeur d'un paramètre répété. C'est
 * volontaire : `?limit=1&limit=999` ne doit pas devenir un tableau qu'un
 * `z.coerce.number()` transformerait en NaN, ni laisser un doute sur laquelle
 * des deux valeurs a été appliquée. Une valeur, une décision.
 */
export function parametres(url: URL): Record<string, string> {
  const sortie: Record<string, string> = {}
  for (const cle of new Set(url.searchParams.keys())) {
    const valeur = url.searchParams.get(cle)
    if (valeur !== null) sortie[cle] = valeur
  }
  return sortie
}
