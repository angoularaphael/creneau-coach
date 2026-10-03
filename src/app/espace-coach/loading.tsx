import { ChargeurLogo } from '@/components/ChargeurLogo';
import { SqueletteTableau } from '@/components/espace-coach/Squelette';

/* La silhouette du tableau de bord, à la forme exacte de la page qui arrive. */
export default function Loading() {
  return (
    <>
      <SqueletteTableau titre="Chargement de votre espace…" />
      {/* Le logo dans son anneau, au centre de l'écran, par-dessus la
          silhouette : la page se prépare, elle ne s'est pas figée. */}
      <div className="chargeur-page chargeur-page--sur" aria-hidden="true">
        <ChargeurLogo texte="Ouverture de votre espace…" />
      </div>
    </>
  );
}
