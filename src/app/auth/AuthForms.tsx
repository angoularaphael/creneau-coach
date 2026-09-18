'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from '@/app/auth/actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Patientez…' : label}
    </button>
  );
}

const initial: AuthActionState = {};

export function SignUpForm() {
  const [state, action] = useFormState(signUpAction, initial);

  return (
    <form action={action} className="auth-form">
      <label>
        Prénom
        <input name="first_name" required autoComplete="given-name" maxLength={80} />
      </label>
      <label>
        Nom
        <input name="last_name" required autoComplete="family-name" maxLength={80} />
      </label>
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
        />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
        />
      </label>
      <p className="field-hint">
        12 caractères min., majuscule, minuscule, chiffre, caractère spécial.
      </p>

      <label className="check">
        <input name="consent_cgu" type="checkbox" />
        <span>
          J’accepte les{' '}
          <Link href="/mentions-legales" target="_blank">
            CGU
          </Link>
        </span>
      </label>
      <label className="check">
        <input name="consent_privacy" type="checkbox" />
        <span>
          J’accepte la{' '}
          <Link href="/confidentialite" target="_blank">
            politique de confidentialité
          </Link>
        </span>
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="form-ok" role="status">{state.message}</p> : null}

      <SubmitButton label="Créer mon compte" />
    </form>
  );
}

export function SignInForm({ next = '/espace-coach' }: { next?: string }) {
  const [state, action] = useFormState(signInAction, initial);

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
        />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}

      <SubmitButton label="Se connecter" />
    </form>
  );
}
