import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = { title: 'Mon profil' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const me = await getSessionMe();
  if (!me) redirect('/auth/connexion?next=/espace-coach/profil');
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href="/espace-coach">Espace coach</Link> / profil
        </p>
        <h1>Mon profil</h1>
        <p className="page-hero__sous">
          Ces informations apparaissent sur vos documents à signer. Votre adresse
          e-mail sert à vous identifier : elle se change depuis la page contact.
        </p>
      </header>
      <section className="section">
        <ProfileForm me={me} />
      </section>
    </>
  );
}
