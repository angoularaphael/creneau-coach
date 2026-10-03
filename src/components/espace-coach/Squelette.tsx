/**
 * LES SILHOUETTES DE L'ESPACE COACH — affichées à l'instant du clic.
 *
 * L'attente partagée (`Chargement`) montrait la même silhouette partout : un
 * titre, deux lignes, une carte. Le tableau de bord arrivait ensuite avec une
 * carte d'encre, un cadran, trois tuiles — tout bougeait de place. Ici la
 * silhouette a LA FORME de la page qui arrive : la carte d'encre est déjà
 * là, son cadran tourne, les tuiles attendent à leur place. Le contenu se pose
 * dedans au lieu de pousser la mise en page.
 *
 * Réservé à l'espace connecté : une page publique ne doit jamais faire
 * dépendre son texte d'un script (les robots ne liraient que la silhouette).
 */

function Ligne({ l = '100%', h = '1rem' }: { l?: string; h?: string }) {
  return <span className="ec-sq__ligne" style={{ width: l, height: h }} />;
}

export function SqueletteTableau({ titre }: { titre: string }) {
  return (
    <div className="ec-sq" role="status" aria-live="polite">
      <span className="vh">{titre}</span>
      <div className="ec-cadre ec-sq__tete" aria-hidden="true">
        <Ligne l="14rem" h="0.75rem" />
        <Ligne l="min(22rem, 80%)" h="3.4rem" />
        <Ligne l="min(26rem, 90%)" />
      </div>
      <div className="ec-cadre" aria-hidden="true">
        <div className="ec-sq__encre">
          <div className="ec-sq__encre-texte">
            <Ligne l="9rem" h="0.75rem" />
            <Ligne l="min(14rem, 70%)" h="3rem" />
            <Ligne l="11rem" h="1.8rem" />
            <Ligne l="min(18rem, 80%)" />
            <Ligne l="13rem" h="3rem" />
          </div>
          <span className="ec-sq__cadran" />
        </div>
      </div>
      <div className="ec-cadre ec-sq__tuiles" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ec-sq__tuile">
            <Ligne l="8rem" h="0.7rem" />
            <Ligne l="6rem" h="2.4rem" />
            <Ligne h="2rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SqueletteFiche({ titre }: { titre: string }) {
  return (
    <div className="ec-sq" role="status" aria-live="polite">
      <span className="vh">{titre}</span>
      <div className="ec-cadre ec-sq__tete" aria-hidden="true">
        <Ligne l="7rem" h="0.85rem" />
        <div className="ec-sq__titre">
          <span className="ec-sq__guichet" />
          <div>
            <Ligne l="10rem" h="0.75rem" />
            <Ligne l="min(18rem, 60vw)" h="3.2rem" />
            <Ligne l="12rem" />
          </div>
        </div>
      </div>
      <div className="ec-cadre ec-sq__fiche" aria-hidden="true">
        <div className="ec-sq__col">
          <div className="ec-sq__tuile ec-sq__parcours">
            <span />
            <span />
            <span />
          </div>
          <div className="ec-sq__tuile">
            <Ligne l="60%" h="2rem" />
            <Ligne />
            <Ligne l="80%" />
            <Ligne h="3.5rem" />
          </div>
        </div>
        <div className="ec-sq__tuile ec-sq__recap">
          <Ligne h="9rem" />
          <Ligne />
          <Ligne l="70%" />
          <Ligne l="85%" />
        </div>
      </div>
    </div>
  );
}
