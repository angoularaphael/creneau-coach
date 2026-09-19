'use client';

import { useId, useState } from 'react';

/**
 * Champ de mot de passe avec bascule « afficher / masquer ».
 *
 * Sans elle, une personne qui se trompe d'un caractère sur un téléphone n'a
 * aucun moyen de le voir : elle efface tout et recommence, et souvent elle
 * abandonne. Le masquage protège d'un regard par-dessus l'épaule, ce qui a du
 * sens ; l'interdiction de vérifier ce qu'on tape n'en a aucun.
 *
 * Trois points qui comptent, et qu'on rate souvent :
 *
 * 1. `aria-pressed` dit l'état au lecteur d'écran. Une icône qui change de
 *    forme ne dit rien à qui ne la voit pas.
 * 2. Le bouton est en `type="button"`. Sans ça, un bouton dans un formulaire
 *    vaut `submit` : afficher son mot de passe enverrait le formulaire.
 * 3. Le champ garde son `autoComplete` d'origine, pour que le gestionnaire de
 *    mots de passe continue de le reconnaître quand il devient `text`.
 */
export function ChampMotDePasse({
  id,
  name = 'password',
  autoComplete = 'current-password',
  required = true,
  className = 'bo-porte__champ',
  autoFocus = false,
  'aria-describedby': describedBy,
}: {
  id?: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-describedby'?: string;
}) {
  const [visible, setVisible] = useState(false);
  const genere = useId();
  const champId = id ?? genere;

  return (
    <div className="mdp">
      <input
        id={champId}
        name={name}
        type={visible ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        className={`${className} mdp__champ`}
      />
      <button
        type="button"
        className="mdp__bascule"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={champId}
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        <span className="vh">
          {visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          {visible ? (
            <>
              <path
                d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path
                d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
