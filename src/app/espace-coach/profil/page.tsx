import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { IcoRetour } from '@/components/espace-coach/Icones';
import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = { title: 'Mon profil' };
export const dynamic = 'force-dynamic';

/*
 * LE PROFIL — ce que les documents disent de vous.
 *
 * La page était un formulaire de cinq champs empilés sur 480 px, puis un champ
 * fichier brut, puis deux boutons gris, avec des messages de développeur :
 * « Photo enregistrée (path privé : …) », « Demande de suppression enregistrée
 * (202) ». Elle est rangée en trois blocs — qui vous êtes, comment vous joindre,
 * ce qui vous qualifie — avec à côté la photo, l'adresse e-mail et vos données.
 * Les appels au serveur sont les mêmes.
 */
export default async function ProfilePage() {
  const me = await getSessionMe();
  if (!me) redirect('/auth/connexion?next=/espace-coach/profil');
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  return (
    <div className="ec-fiche ec-profil">
      <section className="ec-fiche__tete" data-sans-scene aria-labelledby="ec-profil-titre">
        <div className="ec-cadre">
          <Link className="ec-fil ec-entree" style={{ ['--d' as string]: 0 }} href="/espace-coach">
            <IcoRetour taille={17} />
            Mon espace
          </Link>
          <div className="ec-entree" style={{ ['--d' as string]: 1 }}>
            <p className="ec-sur">Mon compte</p>
            <h1 id="ec-profil-titre" className="ec-titre">
              Mon profil
            </h1>
            <p className="ec-signature__sous">
              Ces informations figurent sur les documents que vous signez à chaque réservation. Gardez-les à
              jour : elles accompagnent chacune de vos signatures.
            </p>
          </div>
        </div>
      </section>
      <section className="ec-fiche__corps" data-sans-scene>
        <div className="ec-cadre">
          <ProfileForm me={me} />
        </div>
      </section>
    </div>
  );
}
