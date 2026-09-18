import { ImageResponse } from 'next/og'

/**
 * Vignettes de partage — UNE PAR PAGE, jamais une image par défaut recyclée.
 *
 * La règle est posée : « chaque vignette OG est composée pour sa page — le titre,
 * la ville, le club, le trait du site — et n'est pas la photo par défaut ».
 * Une image partagée entre dix pages est un défaut de barre : un lien envoyé
 * dans un groupe WhatsApp doit dire de quelle page il parle.
 *
 * Générées par `ImageResponse` de Next, donc au format exact 1200×630, sans
 * fichier binaire à maintenir et sans risque qu'une vignette dérive du titre
 * réel de la page : les deux viennent de la même source.
 *
 * Aucun texte inventé : ce qui s'affiche est ce que la page dit.
 */

export const TAILLE_OG = { width: 1200, height: 630 }
export const TYPE_OG = 'image/png'

const ENCRE = '#f4f4f5'
const FOND = '#0c0d0f'
const ACCENT = '#e11d48'
const ESTOMPE = 'rgba(244,244,245,0.55)'

export function vignetteOg({
  titre,
  surtitre,
  detail,
}: {
  /** Le titre de la page, tel qu'il est réellement. */
  titre: string
  /** Ce que la page EST : « Club », « Tarifs », « Réservation ». */
  surtitre: string
  /** Un fait, jamais un slogan. Ex. « 2 espaces · lun–sam 10h–19h ». */
  detail?: string
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: FOND,
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        {/* Le rail d'intensité du planning, repris comme signature de marque.
            Il n'est pas décoratif : c'est le mécanisme du produit. */}
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, height: 10 }}>
          {[0.25, 0.25, 0.95, 0.95, 0.25, 0.25, 0.25, 0.95, 0.95].map((o, i) => (
            <div key={i} style={{ width: 1200 / 9, height: 10, background: ACCENT, opacity: o }} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: ACCENT,
              fontWeight: 700,
            }}
          >
            {surtitre}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: titre.length > 42 ? 66 : 84,
              lineHeight: 1.05,
              color: ENCRE,
              fontWeight: 800,
              letterSpacing: -1.5,
              maxWidth: 1000,
            }}
          >
            {titre}
          </div>
          {detail ? (
            <div style={{ fontSize: 30, color: ESTOMPE, letterSpacing: 0.5 }}>{detail}</div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 26,
          }}
        >
          <div style={{ display: 'flex', color: ENCRE, fontWeight: 700, letterSpacing: 2 }}>
            BOXING&nbsp;<span style={{ color: ACCENT }}>CENTER</span>
          </div>
          <div style={{ display: 'flex', color: ESTOMPE }}>Créneaux coachs</div>
        </div>
      </div>
    ),
    TAILLE_OG,
  )
}
