'use client'

/**
 * Suppression définitive : une confirmation, parce qu'il n'y a pas de corbeille.
 * Le bouton soumet le formulaire qui l'entoure ; « Annuler » ne fait rien partir.
 */
export function BoutonSupprimer({ question, libelle = 'Supprimer' }: { question: string; libelle?: string }) {
  return (
    <button
      className="bo__bouton bo__bouton--danger"
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault()
      }}
    >
      {libelle}
    </button>
  )
}
