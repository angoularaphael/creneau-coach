import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionMe } from '@/lib/auth/session';
import { signOutAction } from '@/app/auth/actions';
import { RESEAU } from '@/lib/seo/verite';
import { IcoCadenas, IcoSortie, IcoTelephone } from '@/components/espace-coach/Icones';

export const metadata: Metadata = { title: 'Compte suspendu' };
export const dynamic = 'force-dynamic';

/*
 * LE COMPTE SUSPENDU — une impasse qui donne la sortie.
 *
 * La page disait « Contactez l'équipe » et proposait un seul bouton vers le
 * formulaire de contact. Un coach bloqué veut parler à quelqu'un, tout de
 * suite : le numéro du réseau est donc le premier geste, le formulaire le
 * second. Le ton reste calme — pas d'alerte rouge, pas de reproche : on ne sait
 * pas pourquoi le compte est suspendu, on dit seulement comment le réactiver.
 */
export default async function SuspendedPage() {
  const me = await getSessionMe();

  return (
    <section className="ec-seuil" data-sans-scene aria-labelledby="ec-suspendu">
      <div className="ec-seuil__carte">
        <span className="ec-seuil__icone" aria-hidden="true">
          <IcoCadenas taille={26} />
        </span>
        <p className="ec-sur">Compte suspendu</p>
        <h1 id="ec-suspendu">Votre compte est en pause</h1>
        <p>
          Vous ne pouvez pas réserver pour le moment : l’équipe Boxing Center doit réactiver votre compte
          avant que vous repreniez des créneaux.
          {me?.profile?.email ? (
            <>
              {' '}
              Compte concerné : <strong>{me.profile.email}</strong>.
            </>
          ) : null}
        </p>
        <div className="ec-seuil__actions">
          <a className="btn ec-btn-encre" href={`tel:${RESEAU.telephone.e164}`}>
            <IcoTelephone taille={18} />
            Appeler le {RESEAU.telephone.affiche}
          </a>
          <Link className="btn btn-ghost" href="/contact">
            Écrire à l’équipe
          </Link>
        </div>
        <form action={signOutAction} className="ec-seuil__sortie">
          <button type="submit" className="btn ec-btn-discret">
            <IcoSortie taille={17} />
            Se déconnecter
          </button>
        </form>
      </div>
    </section>
  );
}
