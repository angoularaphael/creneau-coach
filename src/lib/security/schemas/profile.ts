import 'server-only'

import { z } from 'zod'

/**
 * Profil et contact — spec-04 §8.3, cahier §5 et §4.
 */

/**
 * PATCH /me — openapi #/components/schemas/ProfilePatch (`additionalProperties: false`).
 *
 * LA LISTE DES CHAMPS ABSENTS EST LA PARTIE IMPORTANTE DE CE SCHÉMA.
 * Sont volontairement absents, donc refusés par `strictObject` avec un 400 :
 *   · `status`, `suspended_at`       — sinon un coach se réactive tout seul ;
 *   · `deciplus_member_id`           — cahier §9, il ne remonte à personne ;
 *   · `payplug_customer_id`, `paypal_vault_id` — jetons de paiement ;
 *   · `email`                        — il vit dans `auth.users`, changer d'e-mail
 *                                      passe par le flux Supabase avec
 *                                      confirmation, pas par un PATCH ;
 *   · `photo_path`                   — chemin dans un bucket PRIVÉ ; le laisser
 *                                      écrire, c'est laisser pointer n'importe où.
 */
export const ProfilePatchBody = z.strictObject({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  birth_date: z.iso.date().optional(),
  phone: z.e164().optional(), // cahier §3.1 : « text E.164 ». Plus de regex maison.
  address_line: z.string().trim().max(200).optional(),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: 'Code postal invalide.' })
    .optional(),
  city: z.string().trim().max(100).optional(),
  diploma: z.string().trim().max(200).optional(),
  disciplines: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
})

export type ProfilePatchBody = z.infer<typeof ProfilePatchBody>

/**
 * POST /contact — cahier §4.
 *
 * LA SEULE PORTE OUVERTE À L'INTERNET ENTIER de toute l'application : pas de
 * session, pas de compte. C'est donc la seule route où la limite de débit est
 * FAIL-CLOSED (`rate-limit.ts`), et la seule candidate à un Turnstile le jour où
 * le spam apparaît. Pas de proof-of-work : voir spec-04 §9.1.
 */
export const ContactBody = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: z.email(), // zod 4 : plus de `z.string().email()`, plus de regex maison.
  message: z.string().trim().min(10).max(2000),
})

export type ContactBody = z.infer<typeof ContactBody>
