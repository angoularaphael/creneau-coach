import type { Metadata } from 'next';
import Link from 'next/link';
import { AccesCoach } from '@/components/AccesCoach';
import { SignInForm } from '../AuthForms';
import { authMode } from '@/lib/auth/config';

export const metadata: Metadata = {
  title: 'Connexion',
  /*
   * Hors index, mais liens suivis. Un formulaire n'a rien à faire dans les
   * résultats de recherche ; en revanche les liens qu'il porte (tarifs, clubs)
   * doivent rester parcourus. Sans cette ligne, la page héritait de la racine
   * — donc passait en indexable le jour où l'interrupteur s'ouvre.
   */
  robots: { index: false, follow: true },
  description: 'Accédez à vos réservations, vos avoirs et vos QR d’accès Boxing Center.',
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const mode = authMode();
  const params = await searchParams;
  const next = params.next?.startsWith('/')
    ? params.next
    : '/espace-coach';

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="connexion">
        <h1>Bon retour</h1>
        <p className="page-hero__sous">
          Retrouvez vos réservations, vos avoirs et le QR qui vous ouvre la porte.
        </p>
      </header>
      <AccesCoach next={next}>
        {params.error === 'callback' ? (
          <p className="form-error" role="alert">
            Ce lien de confirmation n’est plus valable. Demandez-en un nouveau.
          </p>
        ) : null}
        {mode === 'unset' ? (
          <p className="note">
            La connexion est momentanément indisponible. Réessayez dans quelques
            minutes, ou écrivez-nous depuis la <Link href="/contact">page contact</Link>.
          </p>
        ) : (
          <>
            <SignInForm next={next} />
            <p className="muted" style={{ marginTop: '1.25rem' }}>
              Pas encore de compte ?{' '}
              <Link href={next === '/espace-coach' ? '/auth/inscription' : `/auth/inscription?next=${encodeURIComponent(next)}`}>
                Créez-en un, c’est gratuit
              </Link>
            </p>
          </>
        )}
      </AccesCoach>
    </>
  );
}
