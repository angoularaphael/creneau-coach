/**
 * LE CHARGEUR — le logo Boxing Center, un anneau cuivré qui tourne autour.
 *
 * Demandé par Eddy le 03/10/2026 : « tant que ça charge, le site ne doit pas
 * rester figé ». Une roue grise générique dirait « logiciel » ; le logo du
 * réseau qui respire au centre d'un anneau dit « Boxing Center prépare votre
 * page ».
 *
 * Purement présentationnel (aucun état, aucun script) : il sert aussi bien
 * dans l'indicateur de navigation (client) que dans les `loading.tsx`
 * (serveur). Mouvement réduit : l'anneau s'arrête, le logo pulse doucement —
 * l'information « ça charge » reste, sans rotation.
 */
export function ChargeurLogo({ texte, taille = 128 }: { texte?: string; taille?: number }) {
  return (
    <div className="chargeur" role="status" aria-live="polite" style={{ ['--taille' as string]: `${taille}px` }}>
      <div className="chargeur__disque">
        <svg className="chargeur__anneau" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="chargeur__piste" cx="50" cy="50" r="46" />
          {/* La traîne (plus longue, plus pâle) puis l'arc franc par-dessus :
              l'œil lit un mouvement, pas un trait qui saute. */}
          <circle className="chargeur__traine" cx="50" cy="50" r="46" />
          <circle className="chargeur__arc" cx="50" cy="50" r="46" />
          <circle className="chargeur__point" cx="50" cy="4" r="3" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element -- un fichier local de 17 Ko, affiché tout de suite : pas besoin de l'optimiseur */}
        <img className="chargeur__logo" src="/logo-blanc.png" alt="" width={132} height={44} />
      </div>
      <p className="chargeur__texte">{texte ?? 'Chargement…'}</p>
    </div>
  )
}
