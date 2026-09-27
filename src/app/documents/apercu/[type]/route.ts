import { cookies } from 'next/headers'

import { sessionEncoreValable } from '@/lib/admin/revalidation'
import { COOKIE_BO, lireSession } from '@/lib/admin/session'
import { estTypeDocument } from '@/lib/documents/obligatoires'
import { VERSION_REDIGEE, documentRedige } from '@/lib/documents/juridique'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ type: string }> }

/**
 * `/documents/apercu/<type>` — le PDF RÉDIGÉ, avant publication, pour le
 * personnel du back-office.
 *
 * Il permet de relire exactement ce que « Publier » mettra en ligne : même
 * texte, mêmes valeurs lues en base, même rendu. Sous `/documents/`, hors du
 * proxy et de sa CSP de page, comme tous les PDF du site ; la porte est ici.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = lireSession((await cookies()).get(COOKIE_BO)?.value)
  if (!session || !(await sessionEncoreValable(session))) {
    return new Response('Réservé au back-office.', { status: 401 })
  }

  const { type } = await ctx.params
  if (!estTypeDocument(type)) return new Response('Document inconnu.', { status: 404 })

  const { pdf } = await documentRedige(type)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.length),
      'content-disposition': `inline; filename="apercu-${type}-${VERSION_REDIGEE}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  })
}
