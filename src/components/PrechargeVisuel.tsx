/**
 * Précharge la photo d'en-tête d'une page, AVANT la feuille de style.
 *
 * Les photos d'en-tête sont des fonds CSS : le navigateur ne les découvre
 * qu'après avoir téléchargé et lu toute la feuille de style. Sur une 4G, c'est
 * une à deux secondes de bande vide là où devrait être la salle. Ces deux
 * `<link rel="preload">` (React 19 les remonte dans le <head>) lancent le
 * bon fichier dès la première ligne du HTML — la version légère sur téléphone,
 * la version pleine sur ordinateur — avec le MÊME point de bascule que la CSS,
 * sans quoi le navigateur téléchargerait les deux.
 */
export function PrechargeVisuel({ fichier, bascule = '47.99rem' }: { fichier: string; bascule?: string }) {
  return (
    <>
      <link rel="preload" as="image" href={`/visuels/${fichier}-m.webp`} media={`(max-width: ${bascule})`} fetchPriority="high" />
      <link rel="preload" as="image" href={`/visuels/${fichier}.webp`} media={`not all and (max-width: ${bascule})`} fetchPriority="high" />
    </>
  )
}
