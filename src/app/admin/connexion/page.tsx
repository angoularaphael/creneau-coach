import { porteConfiguree } from '@/lib/admin/session'
import { actionEntrer } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Porte du back-office.
 *
 * Aucun lien ne pointe ici depuis le site public : la route se connaît, elle ne
 * se découvre pas. Ce n'est pas une mesure de sécurité — l'obscurité n'en est
 * jamais une — mais ça évite d'exposer une cible à tout visiteur de passage.
 *
 * Le message d'erreur est volontairement le même dans tous les cas de refus :
 * un texte différent selon que le mot de passe est faux ou que la porte est mal
 * configurée renseignerait qui essaie.
 */
export default async function ConnexionBackOffice({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suite?: string }>
}) {
  const { erreur, suite } = await searchParams
  const configuree = porteConfiguree()

  return (
    <main className="bo-porte">
      <form action={actionEntrer} className="bo-porte__carte">
        <h1>Back-office</h1>
        <p className="bo-porte__sous">Réservé à l’équipe Boxing Center.</p>

        {!configuree ? (
          <p className="bo-porte__alerte" role="alert">
            La porte n’est pas configurée. Renseigne <code>ADMIN_PASSWORD</code> (12 caractères
            minimum) et <code>SESSION_SECRET</code> (32 minimum) dans <code>.env.local</code>.
          </p>
        ) : null}

        {erreur ? (
          <p className="bo-porte__alerte" role="alert">
            {erreur === 'trop'
              ? 'Trop de tentatives. Réessaie dans une minute.'
              : 'Accès refusé.'}
          </p>
        ) : null}

        <label className="bo-porte__label" htmlFor="mdp">
          Mot de passe
        </label>
        <input
          id="mdp"
          name="motdepasse"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
          className="bo-porte__champ"
        />
        <input type="hidden" name="suite" value={suite ?? '/admin'} />

        <button className="bo-porte__bouton" disabled={!configuree}>
          Entrer
        </button>
      </form>
    </main>
  )
}
