import 'server-only'

import { z } from 'zod'

import { Uuid } from './common'

/**
 * Signature — spec-04 §8.3, cahier §8.
 *
 * L'écran de signature produit un ENGAGEMENT JURIDIQUE. C'est, de toute
 * l'application, la cible la plus rentable pour un attaquant, et le seul endroit
 * où une donnée biométrique de fait (le tracé) transite. D'où la sévérité
 * inhabituelle de ce fichier.
 */

/** Cahier §8 : « taille max 300 Ko ». */
const OCTETS_MAX_SIGNATURE = 300 * 1024

/**
 * On exige un data-URL PNG en base64 canonique.
 *
 * Le `={0,2}` en fin n'est pas cosmétique : il interdit un remplissage `===` ou
 * un `=` en milieu de chaîne, qui sont des formes que certains décodeurs
 * acceptent et d'autres non. Deux décodeurs qui ne sont pas d'accord sur la même
 * entrée, c'est la définition d'une faille d'analyse.
 */
const DATA_URL_PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

function tailleDecodee(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const remplissage = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return (b64.length * 3) / 4 - remplissage
}

/** POST /reservations/{id}/signature — openapi #/components/schemas/SignatureRequest */
export const SignatureBody = z.strictObject({
  // Cahier §8 : les trois documents sont obligatoires. Le fait que ce soient
  // BIEN les trois documents attendus se vérifie EN BASE (`coach_documents`),
  // pas ici : zod compte, la base identifie.
  document_ids: z
    .array(Uuid)
    .min(3, { error: 'Les 3 documents sont obligatoires.' })
    .max(10, { error: 'Trop de documents.' }),

  signature_image: z
    .string()
    // La borne de longueur brute passe AVANT la regex : sur une chaîne de
    // plusieurs mégaoctets, un moteur de regex travaille pour rien et c'est un
    // vecteur de déni de service à coût nul pour l'attaquant.
    .max(Math.ceil((OCTETS_MAX_SIGNATURE * 4) / 3) + 64, {
      error: 'Signature trop lourde (300 Ko max).',
    })
    .regex(DATA_URL_PNG, { error: 'Image de signature invalide.' })
    .refine((v) => tailleDecodee(v) <= OCTETS_MAX_SIGNATURE, {
      error: 'Signature trop lourde (300 Ko max).',
    }),

  // `z.literal(true)`, PAS `z.boolean()` : le cahier §8 dit « consent === true
  // obligatoire ». Avec `z.boolean()`, un `consent: false` serait valide et il
  // faudrait s'en souvenir dix lignes plus bas. Ici, c'est inécrivable.
  consent: z.literal(true, { error: 'Le consentement est obligatoire.' }),
})

export type SignatureBody = z.infer<typeof SignatureBody>
