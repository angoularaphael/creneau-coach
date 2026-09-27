import 'server-only'

import { cache } from 'react'

import { compteBoxplusInchange } from './boxplus'
import { comptePersonnelInchange, estSuperAdminSecours, type ComptePersonnel } from './personnel'

/**
 * Le compte derrière une session back-office est-il TOUJOURS valable ?
 *
 * ── LE TROU QUE CE FICHIER BOUCHE ────────────────────────────────────────
 *
 * Le cookie est signé et vaut 8 heures. Jusqu'au 27/09/2026, seule sa
 * signature était vérifiée : désactiver un compte, le supprimer, ou changer le
 * club d'un responsable ne coupait RIEN. Vérifié ce jour-là : la session d'un
 * compte supprimé ouvrait encore `/admin/documents` — donc, pour un compte
 * direction, la publication des conditions générales signées par les coachs.
 * Un responsable qu'on remercie gardait la main pendant huit heures.
 *
 * Désormais, à chaque requête, le compte est relu LÀ OÙ IL VIT (la source est
 * dans la session) : actif, même rôle, même club. Sinon, la session ne vaut
 * plus rien.
 *
 * ── SI LA BASE NE RÉPOND PAS ─────────────────────────────────────────────
 *
 * Refus. Le back-office lit la même base : il est de toute façon hors service.
 * Seul le super-admin de secours, qui vient de l'environnement, reste valable
 * base éteinte — c'est précisément sa raison d'être.
 *
 * `cache` : une page appelle la garde plusieurs fois (la page, puis chaque
 * fonction de `dal/back-office.ts`). Une seule lecture par requête suffit.
 */
export const compteEncoreValable = cache(async (identifiant: string, source: string, role: string, clubId: string | null): Promise<boolean> => {
  const compte = { identifiant, source, role, clubId, libelle: '' } as ComptePersonnel
  switch (compte.source) {
    case 'secours':
      return compte.role === 'super_admin' && estSuperAdminSecours(compte.identifiant)
    case 'personnel':
      return (await comptePersonnelInchange(compte)) === true
    case 'boxplus':
      if (compte.role === 'salle') return false
      return (await compteBoxplusInchange(compte.identifiant, compte.role)) === true
    default:
      return false
  }
})

export function sessionEncoreValable(s: ComptePersonnel): Promise<boolean> {
  return compteEncoreValable(s.identifiant, s.source, s.role, s.clubId)
}
