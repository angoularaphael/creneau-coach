/**
 * Redirection post-login : chemin interne seulement.
 * `//evil.test` et `/\evil` passeraient un simple `startsWith('/')`.
 */
export function cheminInterneSur(cible: string, repli = '/espace-coach'): string {
  const brut = (cible || '').trim()
  if (!brut.startsWith('/')) return repli
  if (brut.startsWith('//') || brut.startsWith('/\\')) return repli
  if (brut.includes('\\') || brut.includes('://')) return repli
  return brut
}
