/**
 * Ce que le COACH lit à la place des valeurs de la base.
 *
 * Son espace affichait `held`, `awaiting_signature`, `paid`, `payplug` en police
 * de code, et des notes de développeur : « montant serveur figé au hold »,
 * « jamais de prix inventé côté client », « Annuler le hold ». Un coach ne sait
 * pas ce qu'est un hold ; il sait ce qu'est une place gardée.
 *
 * Valeurs relevées dans la base le 27/09/2026 (types `coach_*`), pas devinées.
 * Le back-office a ses propres libellés (`src/app/admin/page.tsx`), écrits pour
 * le personnel : deux publics, deux vocabulaires. Ici, chaque libellé dit au
 * coach où il en est — et, quand il y a quelque chose à faire, quoi.
 *
 * Une valeur inconnue retombe sur la valeur brute : le jour où le moteur ajoute
 * un statut, on le VOIT au lieu d'afficher une case vide.
 */

const STATUT: Record<string, string> = {
  held: 'Place gardée — paiement à faire',
  awaiting_signature: 'Payée — documents à signer',
  confirmed: 'Confirmée',
  consumed: 'Séance passée',
  expired: 'Expirée — place libérée',
  payment_failed: 'Paiement refusé',
  cancelled_credit: 'Annulée — avoir émis',
  no_show: 'Séance non honorée',
}

const PAIEMENT: Record<string, string> = {
  unpaid: 'Non payée',
  paid: 'Payée',
  failed: 'Paiement refusé',
  waived_credit: 'Réglée par avoir',
}

const MOYEN: Record<string, string> = {
  payplug: 'Carte bancaire',
  paypal: 'PayPal',
  credit: 'Avoir',
}

/** Les noms que la base donne aux espaces (`coach_spaces.name`). */
const ESPACE: Record<string, string> = {
  salle: 'Salle',
  boxe: 'Boxe',
  fitness: 'Fitness',
  'mma-sol': 'MMA / sol',
  'boxe-fitness': 'Boxe / fitness',
}

export const libelleStatut = (v: string): string => STATUT[v] ?? v
export const libellePaiement = (v: string): string => PAIEMENT[v] ?? v
export const libelleMoyen = (v: string | null | undefined): string => (v ? (MOYEN[v] ?? v) : '')
export const libelleEspace = (v: string): string => ESPACE[v] ?? v
