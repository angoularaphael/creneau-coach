'use client';

import Link from 'next/link';
import { startTransition, useActionState, useId, useState } from 'react';
import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from '@/app/auth/actions';
import { ChampMotDePasse } from '@/components/ChampMotDePasse';
import { REGLES_MOT_DE_PASSE } from '@/lib/auth/password';

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Patientez…' : label}
    </button>
  );
}

const initial: AuthActionState = {};

/**
 * LA SAISIE N'EST JAMAIS EFFACÉE.
 *
 * Les champs étaient non contrôlés dans un `<form action={…}>`. Or React 19
 * remet ces champs à zéro à la fin de chaque action — y compris quand le
 * serveur REFUSE. Un mot de passe jugé trop faible vidait donc tout le
 * formulaire : prénom, nom, e-mail, mot de passe. Le coach recommençait de
 * zéro, et souvent il partait.
 *
 * Désormais l'envoi passe par `onSubmit` : on appelle l'action nous-mêmes,
 * dans une transition, et React ne remet plus rien à zéro. (Des champs
 * contrôlés ne suffisaient pas : un texte contrôlé survit au `form.reset()`,
 * une case à cocher contrôlée, non — la case des conditions se décochait.)
 * L'attribut `action` reste pour un navigateur sans JavaScript.
 *
 * Et le mot de passe est vérifié AVANT l'envoi, règle par règle, sous les yeux
 * du coach : il corrige ce qu'il a tapé au lieu de deviner ce qu'on attend.
 */

/** Envoie le formulaire à l'action serveur sans passer par la remise à zéro de React. */
function envoyerSansEffacer(e: React.FormEvent<HTMLFormElement>, action: (fd: FormData) => void) {
  e.preventDefault();
  const donnees = new FormData(e.currentTarget);
  startTransition(() => action(donnees));
}
export function SignUpForm({ next = '/espace-coach' }: { next?: string }) {
  const [state, action, enCours] = useActionState(signUpAction, initial);
  const [champs, setChamps] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [cgu, setCgu] = useState(false);
  const [confidentialite, setConfidentialite] = useState(false);
  // Les règles non tenues ne passent en erreur qu'après une tentative d'envoi :
  // souligner en rouge un champ qu'on commence à peine à remplir, c'est gronder
  // avant la faute.
  const [tente, setTente] = useState(false);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const idMdp = useId();
  const idRegles = useId();

  const regles = REGLES_MOT_DE_PASSE.map((r) => ({ ...r, ok: r.tenue(champs.password) }));
  const mdpValide = regles.every((r) => r.ok);
  const maj = (cle: keyof typeof champs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setChamps((c) => ({ ...c, [cle]: e.target.value }));

  function avantEnvoi(e: React.FormEvent<HTMLFormElement>) {
    if (mdpValide) {
      setErreurLocale(null);
      envoyerSansEffacer(e, action);
      return;
    }
    // Pas d'envoi : rien n'est effacé, et le curseur revient sur le mot de passe.
    e.preventDefault();
    setTente(true);
    setErreurLocale('Le mot de passe ne remplit pas encore toutes les règles ci-dessous. Complétez-le : le reste de votre saisie est conservé.');
    document.getElementById(idMdp)?.focus();
  }

  const erreur = erreurLocale ?? state.error;

  return (
    <form action={action} onSubmit={avantEnvoi} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        Prénom
        <input
          name="first_name"
          required
          autoComplete="given-name"
          maxLength={80}
          value={champs.first_name}
          onChange={maj('first_name')}
        />
      </label>
      <label>
        Nom
        <input
          name="last_name"
          required
          autoComplete="family-name"
          maxLength={80}
          value={champs.last_name}
          onChange={maj('last_name')}
        />
      </label>
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
          value={champs.email}
          onChange={maj('email')}
        />
      </label>
      <label htmlFor={idMdp}>
        Mot de passe
        <ChampMotDePasse
          id={idMdp}
          name="password"
          autoComplete="new-password"
          className=""
          aria-describedby={idRegles}
          aria-invalid={tente && !mdpValide}
          value={champs.password}
          onChange={(v) => {
            setChamps((c) => ({ ...c, password: v }));
            if (erreurLocale) setErreurLocale(null);
          }}
        />
      </label>
      <ul id={idRegles} className="mdp-regles" aria-live="polite">
        {regles.map((r) => (
          <li key={r.id} data-ok={r.ok} data-alerte={tente && !r.ok}>
            <span aria-hidden="true" className="mdp-regles__marque">
              {r.ok ? '✓' : '•'}
            </span>
            {r.libelle}
            <span className="vh">{r.ok ? ' : rempli' : ' : à compléter'}</span>
          </li>
        ))}
      </ul>

      <label className="check">
        <input name="consent_cgu" type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
        <span>
          J’accepte les{' '}
          <Link href="/conditions-generales" target="_blank">
            conditions générales d’utilisation et de vente
          </Link>
        </span>
      </label>
      <label className="check">
        <input
          name="consent_privacy"
          type="checkbox"
          checked={confidentialite}
          onChange={(e) => setConfidentialite(e.target.checked)}
        />
        {/* « J'ai lu », pas « J'accepte » : le traitement des données repose
            sur le contrat (RGPD, art. 6.1.b), pas sur un consentement. Dire
            « accepter » laisserait croire qu'on peut le retirer sans fermer
            son compte. */}
        <span>
          J’ai lu la{' '}
          <Link href="/confidentialite" target="_blank">
            politique de confidentialité
          </Link>
        </span>
      </label>

      {erreur ? <p className="form-error" role="alert">{erreur}</p> : null}
      {state.message ? <p className="form-ok" role="status">{state.message}</p> : null}

      <SubmitButton label="Créer mon compte" pending={enCours} />
    </form>
  );
}

export function SignInForm({ next = '/espace-coach' }: { next?: string }) {
  const [state, action, enCours] = useActionState(signInAction, initial);
  // Contrôlés pour la même raison qu'à l'inscription : un mot de passe erroné
  // ne doit pas faire retaper l'adresse e-mail, ni le mot de passe à corriger.
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  return (
    <form action={action} onSubmit={(e) => envoyerSansEffacer(e, action)} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Mot de passe
        <ChampMotDePasse
          name="password"
          autoComplete="current-password"
          className=""
          value={motDePasse}
          onChange={setMotDePasse}
        />
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}

      <SubmitButton label="Se connecter" pending={enCours} />
    </form>
  );
}
