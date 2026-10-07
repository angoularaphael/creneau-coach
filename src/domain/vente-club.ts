/**
 * La vente badge n'est honoree que si Deciplus a encaissé
 * sur le club réservé — jamais un repli vers un autre site.
 */

export function venteAuBonClub(reserve: string, vendu: string): boolean {
  const a = String(reserve || '')
    .trim()
    .toLowerCase()
  const b = String(vendu || '')
    .trim()
    .toLowerCase()
  return Boolean(a && b && a === b)
}
