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
        <p>
          E-mail : {me.profile?.email ?? '—'} (non modifiable ici). Session
          cookie httpOnly.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <ProfileForm me={me} />
      </section>
    </>
  );
}
