import 'server-only'

/**
 * Lecture des variables Supabase — un seul endroit, un seul message d'erreur.
 *
 * Aucun secret en dur nulle part : ce fichier ne contient que des NOMS de
 * variables. `.env.local` est gitignore, `.env.example` ne porte que des valeurs
 * vides. Une variable manquante doit se voir immédiatement, au premier appel,
 * avec le nom exact à poser — pas trois couches plus bas sous la forme d'un
 * « fetch failed » incompréhensible.
 */

function exiger(nom: string, valeur: string | undefined): string {
  const v = (valeur ?? '').trim()
  if (!v) {
    throw new Error(
      `[supabase] variable d'environnement manquante : ${nom}. ` +
        `La poser dans .env.local (jamais dans le dépôt) et dans l'environnement Vercel.`,
    )
  }
  return v
}

/** URL du projet. `NEXT_PUBLIC_SUPABASE_URL` est la même valeur, publiable. */
export function urlSupabase(): string {
  return exiger(
    'SUPABASE_URL',
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  )
}

/** Clé anonyme : elle part au navigateur, c'est prévu. La RLS fait le travail. */
export function cleAnon(): string {
  return exiger('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Clé de service : elle IGNORE la RLS. Elle ne doit jamais être lue depuis un
 * module qui puisse partir au navigateur — d'où le `server-only` en tête de ce
 * fichier, qui casse la compilation plutôt que de laisser fuiter la clé.
 */
export function cleService(): string {
  return exiger('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}
