import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

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
 * risque qu'une vignette dérive du titre réel de la page : les deux viennent de
 * la même source.
 *
 * Aucun texte inventé : ce qui s'affiche est ce que la page dit.
 *
 * ── DEUX CORRECTIONS ─────────────────────────────────────────────────────
 *
 * 1. LA PALETTE ÉTAIT CELLE D'AVANT LA MARQUE. L'accent valait `#e11d48`, un
 *    rouge framboise qui n'est nulle part chez Boxing Center. Toutes les
 *    vignettes déjà partagées sortaient donc aux mauvaises couleurs, et
 *    personne ne le voyait puisqu'une vignette ne se regarde que sur le
 *    téléphone de quelqu'un d'autre. Palette de marque désormais : l'encre, le
 *    noir, le blanc, et le cuivre.
 *
 * 2. LE FOND ÉTAIT PLAT. Chaque page a maintenant SA photo, la même que son
 *    héros, pour que la vignette et la page racontent la même chose.
 *
 * ── POURQUOI CETTE FAÇON DE LIRE LES FICHIERS ────────────────────────────
 *
 * Les fonds vivent dans `./fonds/`, à côté de ce module, et pas dans `public/`.
 * C'est délibéré. Lire `public/` avec `process.cwd()` marche en développement
 * et casse une fois sur deux en production, parce que rien ne garantit que le
 * dossier soit embarqué dans la fonction déployée. C'est exactement le genre de
 * trou qui ne se voit qu'après la mise en ligne.
 *
 * `new URL('./fonds/x.jpg', import.meta.url)` est le motif documenté par Next :
 * l'outil de compilation VOIT le chemin, donc il embarque le fichier. Il faut
 * pour cela que chaque chemin soit écrit en toutes lettres — d'où la table
 * ci-dessous, qui est verbeuse et qui est le prix de la fiabilité. Un chemin
 * construit dynamiquement ne serait pas suivi, et la vignette tomberait en
 * panne en production seulement.
 */

export const TAILLE_OG = { width: 1200, height: 630 }
export const TYPE_OG = 'image/png'

/** Palette Boxing Center. Le cuivre ne touche que ce qui nomme la marque. */
const ENCRE = '#f5f5f5'
const NOIR = '#080808'
const ACCENT = '#b8763a'
const ESTOMPE = 'rgba(245,245,245,0.62)'

/** Chaque fond est écrit en toutes lettres : voir la note ci-dessus. */
const FONDS = {
  'hero-accueil': new URL('./fonds/hero-accueil.jpg', import.meta.url),
  'hero-comment-ca-marche': new URL('./fonds/hero-comment-ca-marche.jpg', import.meta.url),
  'hero-clubs': new URL('./fonds/hero-clubs.jpg', import.meta.url),
  'hero-tarifs': new URL('./fonds/hero-tarifs.jpg', import.meta.url),
  'hero-contact': new URL('./fonds/hero-contact.jpg', import.meta.url),
  'hero-connexion': new URL('./fonds/hero-connexion.jpg', import.meta.url),
  'hero-inscription': new URL('./fonds/hero-inscription.jpg', import.meta.url),
  'hero-mentions-legales': new URL('./fonds/hero-mentions-legales.jpg', import.meta.url),
  'hero-confidentialite': new URL('./fonds/hero-confidentialite.jpg', import.meta.url),
  'hero-club-toulouse-minimes': new URL('./fonds/hero-club-toulouse-minimes.jpg', import.meta.url),
  'hero-club-toulouse-st-cyprien': new URL(
    './fonds/hero-club-toulouse-st-cyprien.jpg',
    import.meta.url,
  ),
  'hero-club-toulouse-etats-unis': new URL(
    './fonds/hero-club-toulouse-etats-unis.jpg',
    import.meta.url,
  ),
  'hero-club-ramonville': new URL('./fonds/hero-club-ramonville.jpg', import.meta.url),
  'hero-club-portet-sur-garonne': new URL(
    './fonds/hero-club-portet-sur-garonne.jpg',
    import.meta.url,
  ),
  'og-accueil': new URL('./fonds/og-accueil.jpg', import.meta.url),
} as const

export type NomDeFond = keyof typeof FONDS

/**
 * `new URL(...)` rend une URL `file://`, et `fetch` ne sait pas les lire — c'est
 * undici qui refuse, pas Next. On garde quand même `new URL`, parce que c'est
 * LUI qui fait embarquer le fichier dans la fonction déployée ; seule la lecture
 * passe par `fs`. Les deux rôles sont distincts et on a besoin des deux.
 */
async function fondEnBase64(nom: NomDeFond): Promise<string> {
  const octets = await readFile(fileURLToPath(FONDS[nom]))
  return `data:image/jpeg;base64,${octets.toString('base64')}`
}

export async function vignetteOg({
  titre,
  surtitre,
  detail,
  fond,
}: {
  /** Le titre de la page, tel qu'il est réellement. */
  titre: string
  /** Ce que la page EST : « Club », « Tarifs », « Réservation ». */
  surtitre: string
  /** Un fait, jamais un slogan. Ex. « 2 espaces · lun–sam 10h–19h ». */
  detail?: string
  /** La photo de CETTE page — la même que son héros. */
  fond: NomDeFond
}) {
  const image = await fondEnBase64(fond)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: NOIR,
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        {/* La photo de la page. */}
        <img
          src={image}
          width={1200}
          height={630}
          style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
        />

        {/* Le voile. Sans lui le titre se pose sur la photo et se perd : une
            vignette se lit en vignette, à deux centimètres, dans un fil. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: 'flex',
            background:
              'linear-gradient(105deg, rgba(8,8,8,0.94) 0%, rgba(8,8,8,0.82) 46%, rgba(12,13,26,0.52) 100%)',
          }}
        />

        {/* Le filet cuivre sur l'arête haute : la signature de la marque. */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 8,
            background: ACCENT,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
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

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}
        >
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
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', color: ENCRE, fontWeight: 700, letterSpacing: 2 }}>
            BOXING&nbsp;<span style={{ color: ACCENT }}>CENTER</span>
          </div>
          <div style={{ display: 'flex', color: ESTOMPE }}>Location de salle à l’heure</div>
        </div>
      </div>
    ),
    TAILLE_OG,
  )
}
