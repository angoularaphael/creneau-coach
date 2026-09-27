'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { exigeSessionBackOffice } from '@/lib/admin/garde'
import { estTypeDocument, publierDocument } from '@/lib/documents/obligatoires'

/**
 * Publier une version d'un document à signer — cahier §16 et §21.
 *
 * Une Server Action est une route POST publique : la session ET le rôle sont
 * revérifiés ici, pas seulement dans la page qui affiche le formulaire. Un
 * responsable de salle ne publie pas les CGV de l'entreprise.
 *
 * Le résultat repart dans l'URL sous forme de CODE, jamais de texte libre : un
 * lien fabriqué ne peut pas faire afficher un message arbitraire dans le
 * back-office.
 */
export async function actionPublierDocument(form: FormData) {
  const staff = await exigeSessionBackOffice('/admin/documents')
  if (staff.role === 'salle') redirect('/admin/documents?refus=role')

  const type = String(form.get('type') ?? '')
  if (!estTypeDocument(type)) redirect('/admin/documents?refus=type')

  const fichier = form.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) redirect(`/admin/documents?refus=vide&type=${type}`)

  const resultat = await publierDocument({
    type,
    version: String(form.get('version') ?? ''),
    octets: Buffer.from(await fichier.arrayBuffer()),
    auteur: staff.identifiant,
  })

  revalidatePath('/admin/documents')
  revalidatePath('/admin')
  redirect(
    resultat.ok
      ? `/admin/documents?publie=${type}${resultat.rejeu ? '&rejeu=1' : ''}`
      : `/admin/documents?refus=${resultat.code}&type=${type}`,
  )
}
