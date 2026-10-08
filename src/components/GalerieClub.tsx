import Image from 'next/image'

import type { ClubId } from '@/domain/contrat'
import { GALERIES_CLUBS, cheminPhoto } from '@/lib/photos-clubs'

/**
 * Ce que le coach loue, en vraies photos : six vues de l’espace, avant le
 * planning et le paiement. L’argument n’est pas un adjectif, c’est le lieu.
 */
export function GalerieClub({ club, nomCourt, creuse, pleine }: { club: ClubId; nomCourt: string; creuse: string; pleine: string }) {
  const photos = GALERIES_CLUBS[club]
  if (!photos?.length) return null
  return (
    <section className="section galerie-club" aria-labelledby="t-galerie-club">
      <div className="enveloppe">
        <p className="sur mono">Le lieu, avant l’heure</p>
        <h2 id="t-galerie-club">Ce que vous louez {nomCourt}</h2>
        <p className="intro">
          Ring, sacs, tatamis, musculation : votre client entre dans une vraie salle de boxe, équipée, et
          vous n’avancez ni loyer ni matériel. Vous payez l’heure que vous utilisez — {creuse} en heure
          creuse, {pleine} en heure pleine — et le reste de la séance vous revient.
        </p>
        <ul className="galerie-club__grille">
          {photos.map((p, i) => (
            <li key={p.f} className={i === 0 ? 'galerie-club__item galerie-club__item--grand' : 'galerie-club__item'}>
              <figure>
                <Image src={cheminPhoto(club, p.f)} alt={p.alt} width={1600} height={1067}
                  sizes={i === 0 ? '(min-width: 60rem) 60vw, 100vw' : '(min-width: 60rem) 30vw, 50vw'} />
                <figcaption className="mono">{p.titre}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
