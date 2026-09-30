/**
 * Mot de passe robuste — Lot B §2.2.
 *
 * UNE liste de règles, lue à deux endroits : par le serveur, qui refuse, et par
 * le formulaire, qui les montre cochées au fur et à mesure de la saisie. Les
 * deux ne peuvent pas diverger — c'est la même liste.
 *
 * 8 caractères depuis le 30/09/2026 (Eddy), au lieu de 12 : la longueur baisse,
 * la force reste — majuscule, minuscule, chiffre et caractère spécial toujours
 * exigés.
 */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8

export type RegleMotDePasse = {
  readonly id: string
  /** Ce que le coach lit sous le champ. */
  readonly libelle: string
  /** Ce que le serveur répond quand la règle n'est pas tenue. */
  readonly erreur: string
  readonly tenue: (motDePasse: string) => boolean
}

export const REGLES_MOT_DE_PASSE: readonly RegleMotDePasse[] = [
  {
    id: 'longueur',
    libelle: `${LONGUEUR_MIN_MOT_DE_PASSE} caractères au moins`,
    erreur: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    tenue: (m) => m.length >= LONGUEUR_MIN_MOT_DE_PASSE,
  },
  {
    id: 'casse',
    libelle: 'une majuscule et une minuscule',
    erreur: 'Le mot de passe doit contenir majuscules et minuscules.',
    tenue: (m) => /[a-z]/.test(m) && /[A-Z]/.test(m),
  },
  {
    id: 'chiffre',
    libelle: 'un chiffre',
    erreur: 'Le mot de passe doit contenir au moins un chiffre.',
    tenue: (m) => /[0-9]/.test(m),
  },
  {
    id: 'special',
    libelle: 'un caractère spécial (! ? @ # …)',
    erreur: 'Le mot de passe doit contenir au moins un caractère spécial.',
    tenue: (m) => /[^A-Za-z0-9]/.test(m),
  },
]

export function validatePassword(password: string): string | null {
  return REGLES_MOT_DE_PASSE.find((r) => !r.tenue(password))?.erreur ?? null
}
