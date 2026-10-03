import { ChargeurLogo } from '@/components/ChargeurLogo';
import { SqueletteFiche } from '@/components/espace-coach/Squelette';

/* La silhouette d'une fiche : guichet de date, parcours, geste, récapitulatif. */
export default function Loading() {
  return (
    <>
      <SqueletteFiche titre="Chargement de la réservation…" />
      {/* Le logo dans son anneau, au centre de l'écran, par-dessus la
          silhouette : la page se prépare, elle ne s'est pas figée. */}
      <div className="chargeur-page chargeur-page--sur" aria-hidden="true">
        <ChargeurLogo texte="Ouverture de la réservation…" />
      </div>
    </>
  );
}
