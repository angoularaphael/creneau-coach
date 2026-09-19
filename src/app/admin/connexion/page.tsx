import { porteConfiguree } from '@/lib/admin/session'
import { ChampMotDePasse } from '@/components/ChampMotDePasse'
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
        <p className="bo-porte__sous">
          Réservé à l’équipe Boxing Center. Les coachs se connectent{' '}
          <a href="/auth/connexion">sur leur espace</a>.
        </p>

        {!configuree ? (
          <p className="bo-porte__alerte" role="alert">
            La connexion n’est pas disponible pour le moment. Prévenez l’équipe
            technique.
          </p>
        ) : null}

        {erreur ? (
          <p className="bo-porte__alerte" role="alert">
            {erreur === 'trop'
              ? 'Trop de tentatives. Réessaie dans une minute.'
              : 'Accès refusé.'}
          </p>
        ) : null}

        {/*
          LE CHAMP N'EST PLUS UN E-MAIL, ET ÇA A CASSÉ LA PORTE.

          Il était en `type="email"`. Depuis que chaque salle a son identifiant
          — « minimes », « st-cyprien » —, le navigateur refusait la saisie
          AVANT l'envoi : le formulaire ne partait pas, et aucun message
          n'expliquait pourquoi. Une validation trop zélée qui bloque la seule
          façon correcte de se connecter.

          `type="text"` accepte les deux : un identifiant de salle comme une
          adresse BOXPLUS. `autoComplete="username"` est conservé pour que les
          gestionnaires de mots de passe continuent de le reconnaître.
        */}
        <label className="bo-porte__label" htmlFor="email">
          Identifiant
        </label>
        <input
          id="email"
          name="email"
          type="text"
          required
          autoComplete="username"
          autoFocus
          autoCapitalize="none"
          spellCheck={false}
          className="bo-porte__champ"
          aria-describedby="aide-identifiant"
        />
        <p id="aide-identifiant" className="bo-porte__aide">
          Le nom de votre salle, ou votre adresse si vous êtes à la direction.
        </p>

        <label className="bo-porte__label" htmlFor="mdp">
          Mot de passe
        </label>
        <ChampMotDePasse id="mdp" name="motdepasse" autoComplete="current-password" />
        <input type="hidden" name="suite" value={suite ?? '/admin'} />

        <button className="bo-porte__bouton" disabled={!configuree}>
          Entrer
        </button>
      </form>
    </main>
  )
}
