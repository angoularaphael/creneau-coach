import { documentsEnVigueur, estPublie, estTypeDocument, lireDocument } from '@/lib/documents/obligatoires'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ type: string }> }

/**
 * `/documents/cgv`, `/documents/reglement`, `/documents/decharge` — la version
 * en vigueur, en PDF, lisible par tout le monde.
 *
 * Sans compte : les conditions d'une offre se lisent AVANT de s'inscrire, pas
 * après avoir payé. C'est aussi ce que le coach ouvre depuis la page de
 * signature, pour lire ce qu'il accepte.
 *
 * L'ETag est l'empreinte du fichier, lue en base : un navigateur qui a déjà la
 * bonne version reçoit un 304 sans qu'on télécharge quoi que ce soit du seau.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { type } = await ctx.params
  if (!estTypeDocument(type)) return new Response('Document inconnu.', { status: 404 })

  const courant = (await documentsEnVigueur()).find((d) => d.kind === type)
  if (!courant || !estPublie(courant)) {
    return new Response(
      'Ce document est en cours de publication par Boxing Center. Revenez un peu plus tard.',
      { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } },
    )
  }

  const etag = `"${courant.file_sha256}"`
  const communs = {
    etag,
    // Revalider à chaque ouverture : une nouvelle version doit se voir tout de
    // suite, c'est elle que le coach va signer.
    'cache-control': 'public, no-cache',
    'x-robots-tag': 'noindex',
  }
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: communs })
  }

  const lu = await lireDocument(type)
  if (!lu) {
    return new Response('Document momentanément indisponible.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' },
    })
  }

  const nomFichier = `boxing-center-${type}-${lu.doc.version.replace(/[^\w.-]+/g, '-')}.pdf`
  return new Response(new Uint8Array(lu.octets), {
    status: 200,
    headers: {
      ...communs,
      'content-type': 'application/pdf',
      'content-length': String(lu.octets.length),
      'content-disposition': `inline; filename="${nomFichier}"`,
      'x-content-type-options': 'nosniff',
    },
  })
}
