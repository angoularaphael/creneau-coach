import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '../AuthForms';
import { authMode } from '@/lib/auth/config';

export const metadata: Metadata = {
  title: 'Créer mon compte coach',
  description:
    'Créez votre compte en une minute et réservez votre première heure de salle dans un club Boxing Center à Toulouse.',
};

/**
 * Création de compte.
 *
 * Cette page affichait « Compte personnel — cookies de session httpOnly », et,
 * quand la configuration manquait, le nom des variables d'environnement à
 * renseigner. Un coach qui vient louer une salle n'a rien à faire de tout ça :
 * ce sont des notes de développeur laissées sur une vitrine.
 *
 * Règle, sur toutes les pages publiques : on écrit ce que la personne gagne,
 * jamais comment c'est fait. Le détail technique vit dans le code, en commentaire.
 */
export default function SignUpPage() {
  const mode = authMode();

  return (
    <>
      <header className="page-hero">
        <p className="sur mono">Gratuit · une minute</p>
        <h1>Créez votre compte coach</h1>
        <p className="page-hero__sous">
          Une fois inscrit, vous voyez les créneaux libres des cinq clubs et vous
          réservez en deux clics. Pas d’abonnement, pas d’engagement : vous ne payez
          que les heures que vous prenez.
        </p>
      </header>

      <section className="section section--etroite" style={{ paddingTop: 0 }}>
        {mode === 'unset' ? (
          <p className="note">
            La création de compte est momentanément indisponible. Réessayez dans
            quelques minutes, ou écrivez-nous depuis la{' '}
            <Link href="/contact">page contact</Link>.
          </p>
        ) : (
          <>
            <SignUpForm />
            <p className="muted" style={{ marginTop: '1.25rem' }}>
              Vous avez déjà un compte ? <Link href="/auth/connexion">Connectez-vous</Link>
            </p>
          </>
        )}
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Ce que votre compte vous donne</h2>
          <ul className="regles">
            <li>
              <b>La disponibilité en direct</b> des cinq clubs, espace par espace.
            </li>
            <li>
              <b>Vos réservations au même endroit</b>, avec le QR qui ouvre la porte le
              jour venu.
            </li>
            <li>
              <b>Vos avoirs</b> si vous annulez à plus de 24 heures, réutilisables sur
              n’importe quel créneau.
            </li>
            <li>
              <b>Vos justificatifs</b> réunis une fois pour toutes, à ne plus renvoyer à
              chaque réservation.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
