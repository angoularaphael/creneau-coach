/**
 * L'écran d'attente d'une navigation — affiché À L'INSTANT du clic.
 *
 * Sans lui, un clic sur un club ou une réservation ne faisait rien de visible
 * pendant une à deux secondes : la page suivante se calculait côté serveur et
 * l'ancienne restait figée. On recliquait, on doutait. Ici, la silhouette de la
 * page arrive tout de suite ; le contenu la remplace dès qu'il est prêt.
 *
 * RÉSERVÉ AUX PAGES PRIVÉES (espace coach). Sur une page publique, un écran
 * d'attente fait partir le vrai texte dans un bloc caché, révélé par script :
 * un robot qui n'exécute pas JavaScript — plusieurs robots d'IA — ne lirait
 * qu'une silhouette. Les pages club restent donc rendues d'un seul tenant.
 */
export function Chargement({ titre }: { titre: string }) {
  return (
    <div className="chargement" role="status" aria-live="polite">
      <span className="vh">{titre}</span>
      <div className="page-hero chargement__hero" aria-hidden="true">
        <span className="chargement__ligne chargement__ligne--court" />
        <span className="chargement__ligne chargement__ligne--titre" />
        <span className="chargement__ligne" />
      </div>
      <div className="section" aria-hidden="true">
        <div className="chargement__carte">
          <span className="chargement__ligne chargement__ligne--titre" />
          <span className="chargement__ligne" />
          <span className="chargement__ligne chargement__ligne--court" />
        </div>
      </div>
    </div>
  );
}
