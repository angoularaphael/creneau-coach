import type { Metadata } from 'next';
import Link from 'next/link';
import { listClubs } from '@/lib/api/client';

export const metadata: Metadata = {
  title: 'Nos clubs',
};

export default async function ClubsPage() {
  const clubs = await listClubs();

  return (
    <>
      <header className="page-hero">
        <h1>Nos clubs</h1>
        <p>Cinq salles Boxing Center — choisissez votre club pour voir la grille.</p>
      </header>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="club-list">
          {clubs.map((club) => (
            <Link key={club.id} href={`/clubs/${club.id}`} className="club-link">
              <h3>{club.name}</h3>
              <p className="meta">{club.city}</p>
              <div className="spaces">
                {club.spaces.map((s) => (
                  <span key={s.id}>{s.name}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
