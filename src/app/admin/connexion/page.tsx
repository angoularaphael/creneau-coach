import { porteConfiguree } from '@/lib/admin/session'
import { actionEntrer } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Porte du back-office.
 *
 * E-mail + mot de passe identiques à BOXPLUS / gestion-manager (`app_users`).
 * Le message de refus est le même dans tous les cas (compte inconnu, hash faux,
 * porte mal configurée) : on ne renseigne pas qui essaie.
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
        <p className="bo-porte__sous">Même compte que le back-office BOXPLUS.</p>

        {!configuree ? (
          <p className="bo-porte__alerte" role="alert">
            La porte n’est pas configurée. Renseigne{' '}
            <code>BOXPLUS_SUPABASE_URL</code>, <code>BOXPLUS_SUPABASE_SERVICE_ROLE_KEY</code> et{' '}
            <code>SESSION_SECRET</code> (32 caractères minimum).
          </p>
        ) : null}

        {erreur ? (
          <p className="bo-porte__alerte" role="alert">
            {erreur === 'trop'
              ? 'Trop de tentatives. Réessaie dans une minute.'
              : 'Accès refusé.'}
          </p>
        ) : null}

        <label className="bo-porte__label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          inputMode="email"
          className="bo-porte__champ"
        />

        <label className="bo-porte__label" htmlFor="mdp">
          Mot de passe
        </label>
        <input
          id="mdp"
          name="motdepasse"
          type="password"
          required
          autoComplete="current-password"
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
