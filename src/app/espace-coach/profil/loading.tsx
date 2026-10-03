import { ChargeurLogo } from '@/components/ChargeurLogo';
import { SqueletteFiche } from '@/components/espace-coach/Squelette';

/*
 * Sans elle, le profil héritait de la silhouette du tableau de bord (carte
 * d'encre, cadran) : on attendait un écran qui n'allait pas venir.
 */
export default function Loading() {
  return (
    <>
      <SqueletteFiche titre="Chargement de votre profil…" />
      <div className="chargeur-page chargeur-page--sur" aria-hidden="true">
        <ChargeurLogo texte="Ouverture de votre profil…" />
      </div>
    </>
  );
}
