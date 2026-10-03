/**
 * LES PICTOGRAMMES DE L'ESPACE COACH — dessinés ici, pas importés.
 *
 * Une bibliothèque d'icônes, c'est 200 pictogrammes au même trait que tous les
 * tableaux de bord du monde : exactement l'air « gabarit » qu'on refuse. Ceux-ci
 * sont peu nombreux, au même trait (1,75 sur 24), angles francs, et chacun
 * désigne un geste du parcours — payer, signer, entrer — pas une décoration.
 *
 * Tous en `currentColor` et `aria-hidden` : le texte voisin dit ce que c'est,
 * l'icône ne fait que le montrer plus vite.
 */

import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { taille?: number }

function Svg({ taille = 20, children, ...p }: P & { children: ReactNode }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  )
}

export const IcoCarte = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M2.5 9.5h19M6.5 15h4" />
  </Svg>
)

/** PayPal : deux « P » décalés, au trait — pas le logo de la marque. */
export const IcoPaypal = (p: P) => (
  <Svg {...p}>
    <path d="M7 20l2.2-14h6a3.6 3.6 0 0 1 0 7.2H11" />
    <path d="M10 17l.8-4" />
  </Svg>
)

/** L'avoir : un jeton, la monnaie de la maison. */
export const IcoAvoir = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="5" />
    <path d="M12 9.5v5" />
  </Svg>
)

export const IcoStylo = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" />
    <path d="M13.5 7.3l3.2 3.2" />
  </Svg>
)

export const IcoQr = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
    <path d="M14 14h2.5v2.5M20.5 14v0M14 20.5h2.5M18.5 18.5h2v2" />
  </Svg>
)

export const IcoCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const IcoFleche = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const IcoRetour = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const IcoExterne = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
)

export const IcoItineraire = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
)

export const IcoAgenda = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v4M10 15.5h4" />
  </Svg>
)

export const IcoSoleil = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
)

export const IcoCadenas = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
  </Svg>
)

export const IcoPorte = (p: P) => (
  <Svg {...p}>
    <path d="M4 21h16M6 21V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V21" />
    <path d="M14.5 12.5v.01" />
  </Svg>
)

export const IcoDocument = (p: P) => (
  <Svg {...p}>
    <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5z" />
    <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" />
  </Svg>
)

export const IcoTelephone = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h3.5l1.6 4-2.2 1.5a11 11 0 0 0 6.6 6.6l1.5-2.2 4 1.6V19a1.5 1.5 0 0 1-1.5 1.5A16 16 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
  </Svg>
)

export const IcoSortie = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4" />
  </Svg>
)

export const IcoAlerte = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l9.5 16.5h-19L12 3.5z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
)

export const IcoCroix = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IcoEnveloppe = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
  </Svg>
)

export const IcoPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

/** L'icône du moyen de paiement, d'après la valeur de la base. */
export function IcoMoyen({ moyen, ...p }: P & { moyen: string | null | undefined }) {
  if (moyen === 'paypal') return <IcoPaypal {...p} />
  if (moyen === 'credit') return <IcoAvoir {...p} />
  return <IcoCarte {...p} />
}
