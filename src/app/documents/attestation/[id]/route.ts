import { exigerSession } from '@/lib/dal/acteur'
import { lireReservation } from '@/lib/dal/reservations'
import { SEAU_PRIVE, sha256 } from '@/lib/documents/obligatoires'
import { contexteRequete } from '@/lib/security'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * `/documents/attestation/<réservation>` — l'attestation de signature d'UNE
 * réservation, pour SON coach. Cahier §27 : le coach retrouve ses documents
 * signés dans son espace.
 *
 * Sous `/documents/` et non sous `/espace-coach/` : c'est un PDF, servi hors du
 * proxy et de sa CSP de page (voir `src/proxy.ts`). La porte est donc ICI.
 *
 * Deux temps, et l'ordre est la sécurité :
 *   1. la réservation est lue AVEC la session du coach : la RLS ne la rend que
 *      si elle est à lui. Sinon 404, sans dire si elle existe ;
 *   2. seulement alors, le client service_role lit le chemin de l'attestation
 *      et le fichier. Ce chemin n'est granté à personne (0013 §6) et le fichier
 *      vit dans `signatures/`, où le coach ne peut pas écrire : il peut relire sa
 *      preuve, jamais la réécrire.
 *
 * Le fichier est revérifié contre l'empreinte écrite à la signature. S'il a
 * bougé, on ne le sert pas : ce ne serait plus la preuve.
 */
export async function GET(req: Request, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return new Response('Connectez-vous pour continuer.', { status: 401 })

  const { id } = await ctxRoute.params
  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) return new Response('Introuvable.', { status: 404 })

  const sb = createServiceClient()
  const { data: preuve } = await sb
    .from('coach_signatures')
    .select('pdf_path, pdf_sha256')
    .eq('reservation_id', id)
    .eq('coach_id', session.valeur.acteur.id)
    .limit(1)
    .maybeSingle<{ pdf_path: string; pdf_sha256: string }>()
  if (!preuve) return new Response('Aucune signature pour cette réservation.', { status: 404 })

  const { data, error } = await sb.storage.from(SEAU_PRIVE).download(preuve.pdf_path)
  if (error || !data) return new Response('Attestation momentanément indisponible.', { status: 503 })
  const octets = Buffer.from(await data.arrayBuffer())
  if (sha256(octets) !== preuve.pdf_sha256) {
    console.error(`[${ctx.requestId}] attestation : empreinte divergente`, { reservation: id })
    return new Response('Attestation indisponible. Contactez Boxing Center.', { status: 409 })
  }

  return new Response(new Uint8Array(octets), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(octets.length),
      'content-disposition': `inline; filename="attestation-signature-${id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  })
}
