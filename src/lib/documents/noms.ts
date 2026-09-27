/**
 * Les documents à signer, nommés comme on les dit — avec leur article.
 *
 * « J'ai lu et j'accepte les conditions générales de vente, règlement intérieur
 * et décharge » : c'est ce que produisait une simple jonction des titres, sur la
 * case de consentement ET sur le bandeau du back-office. Une phrase juridique
 * bancale sur l'écran qui engage le coach, ça se voit.
 *
 * Sans `server-only` : la case de consentement est un composant client.
 */
const AVEC_ARTICLE: Record<string, string> = {
  cgv: 'les conditions générales d’utilisation et de vente',
  reglement: 'le règlement intérieur',
  decharge: 'la décharge de responsabilité',
}

export function nomAvecArticle(doc: { readonly kind: string; readonly title: string }): string {
  return AVEC_ARTICLE[doc.kind] ?? `le document « ${doc.title} »`
}

/** « A, B et C » — l'énumération française, sans virgule avant le « et ». */
export function enumererDocuments(docs: readonly { readonly kind: string; readonly title: string }[]): string {
  const noms = docs.map(nomAvecArticle)
  return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : (noms[0] ?? '')
}
