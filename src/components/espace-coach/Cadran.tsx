'use client'

import { useRouter } from 'next/navigation'
import { HEURE, JOUR, decomposer, deux } from './temps'
import { useAZero, useMaintenant } from './horloge'

/**
 * LE CADRAN — le décompte d'une heure louée, dessiné comme une lunette de montre.
 *
 * La thèse du site est « l'heure est un objet de précision ». Un compte à
 * rebours en chiffres seuls est un minuteur de cuisine ; ici, soixante index
 * gravés font le tour du cadran et s'éteignent un à un à mesure que l'heure
 * approche. On LIT la distance avant de lire les chiffres.
 *
 * ── L'ÉCHELLE CHANGE AVEC LA DISTANCE ─────────────────────────────────────
 * Comme une montre à complications : à plus d'un jour, le tour complet vaut
 * une semaine ; à moins d'un jour, vingt-quatre heures ; à moins d'une heure,
 * soixante minutes. Plus la séance approche, plus la graduation s'affine —
 * à trois jours la seconde est du bruit, à trois minutes c'est l'information.
 * Une échelle fixe (`echelle`) remplace ce choix quand la durée est connue :
 * les dix minutes d'une place gardée, par exemple.
 *
 * ── L'AIGUILLE DES SECONDES ───────────────────────────────────────────────
 * Un point fait le tour en une minute, par sauts d'une seconde avec un léger
 * dépassement : le battement d'un mouvement à quartz. C'est le seul élément
 * qui bouge en continu, et il dit une chose utile : « ce chiffre est vivant ».
 * Son angle est CUMULÉ depuis le montage, jamais ramené à 0 : sinon, à 59 → 0,
 * la transition repartait à l'envers sur tout le cadran.
 */

const INDEX = 60
const C = 120 // centre du cadran (viewBox 240)
const R_PISTE = 96
const CIRC = 2 * Math.PI * R_PISTE

type Props = {
  /** L'instant visé (ISO). */
  cible: string
  /** L'heure du serveur au rendu, en ms : premier affichage identique des deux côtés. */
  maintenant: number
  /** Pleine échelle fixe en ms (ex. la durée d'une place gardée). */
  echelle?: number
  /** Petit texte au-dessus des chiffres. */
  surtitre?: string
  /** Petit texte sous les chiffres. */
  legende?: string
  /** Ce que dit le centre quand le décompte est fini. */
  legendeFin?: string
  /** Sur fond d'encre (`nuit`) ou sur fond clair (`jour`). */
  ton?: 'nuit' | 'jour'
  taille?: 'grand' | 'moyen'
  /** La piste passe au brun : le temps qui reste est celui d'une DÉCISION. */
  decision?: boolean
  /** À zéro, relire la page côté serveur — l'état a changé (accès ouvert, place libérée). */
  rafraichir?: boolean
  /** Nom accessible du minuteur. */
  etiquette: string
}

/**
 * Le cadran AU REPOS — quand il n'y a rien à décompter (aucune séance prévue).
 *
 * Il ne ment pas : aucun chiffre ne descend, aucune aiguille ne tourne. Les
 * soixante index s'allument une fois, en tour complet : c'est l'heure entière,
 * celle qu'on loue — le produit, dessiné.
 */
export function CadranFixe({
  haut,
  chiffre,
  unite,
  bas,
  ton = 'jour',
}: {
  haut: string
  chiffre: string
  unite: string
  bas: string
  ton?: 'nuit' | 'jour'
}) {
  return (
    <div className="ec-cadran" data-ton={ton} data-taille="grand" data-repos aria-hidden="true">
      <svg className="ec-cadran__svg" viewBox="0 0 240 240" focusable="false">
        <circle className="ec-cadran__piste" cx={C} cy={C} r={R_PISTE} />
        <circle
          className="ec-cadran__arc"
          cx={C}
          cy={C}
          r={R_PISTE}
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: 0, ['--c' as string]: CIRC }}
          transform={`rotate(-90 ${C} ${C})`}
        />
        <g className="ec-cadran__index">
          {Array.from({ length: INDEX }, (_, i) => (
            <line
              key={i}
              x1={C}
              y1={i % 5 === 0 ? 6 : 8}
              x2={C}
              y2={i % 5 === 0 ? 19 : 14}
              transform={`rotate(${i * 6} ${C} ${C})`}
              data-majeur={i % 5 === 0 || undefined}
              data-allume
              style={{ ['--i' as string]: i }}
            />
          ))}
        </g>
      </svg>
      <div className="ec-cadran__centre">
        <span className="ec-cadran__sur">{haut}</span>
        <span className="ec-cadran__chiffres">
          <span className="ec-cadran__groupe">
            <b>{chiffre}</b>
            <small>{unite}</small>
          </span>
        </span>
        <span className="ec-cadran__legende">{bas}</span>
      </div>
    </div>
  )
}

function groupes(ms: number, max: number): [string, string][] {
  const { j, h, m, s } = decomposer(ms)
  const tous: [string, string][] =
    j > 0
      ? [[String(j), 'j'], [deux(h), 'h'], [deux(m), 'min']]
      : h > 0
        ? [[deux(h), 'h'], [deux(m), 'min'], [deux(s), 's']]
        : [[deux(m), 'min'], [deux(s), 's']]
  return tous.slice(0, max)
}

function echelleAuto(reste: number): number {
  if (reste >= JOUR) return 7 * JOUR
  if (reste >= HEURE) return JOUR
  return HEURE
}

export function Cadran({
  cible,
  maintenant,
  echelle,
  surtitre,
  legende,
  legendeFin = 'C’est l’heure',
  ton = 'jour',
  taille = 'grand',
  decision = false,
  rafraichir = false,
  etiquette,
}: Props) {
  const router = useRouter()
  const t = useMaintenant(maintenant)
  const reste = Math.max(0, new Date(cible).getTime() - t)
  useAZero(reste, () => {
    if (rafraichir) router.refresh()
  })

  const pleine = echelle ?? echelleAuto(reste)
  const fraction = Math.min(1, reste / pleine)
  const allumes = Math.ceil(fraction * INDEX)
  // Angle cumulé de l'aiguille : la seconde murale, comptée depuis le rendu serveur.
  const base = Math.floor(maintenant / 1000)
  const angle = (new Date(maintenant).getSeconds() + Math.floor(t / 1000) - base) * 6
  const fini = reste <= 0
  const chiffres = groupes(reste, taille === 'grand' ? 3 : 2)

  return (
    <div
      className="ec-cadran"
      data-ton={ton}
      data-taille={taille}
      data-decision={decision || undefined}
      data-fini={fini || undefined}
      role="timer"
      aria-label={etiquette}
    >
      <svg className="ec-cadran__svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
        <circle className="ec-cadran__piste" cx={C} cy={C} r={R_PISTE} />
        <circle
          className="ec-cadran__arc"
          cx={C}
          cy={C}
          r={R_PISTE}
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: CIRC * (1 - fraction), ['--c' as string]: CIRC }}
          transform={`rotate(-90 ${C} ${C})`}
        />
        <g className="ec-cadran__index">
          {Array.from({ length: INDEX }, (_, i) => {
            const majeur = i % 5 === 0
            return (
              <line
                key={i}
                x1={C}
                y1={majeur ? 6 : 8}
                x2={C}
                y2={majeur ? 19 : 14}
                transform={`rotate(${i * 6} ${C} ${C})`}
                data-majeur={majeur || undefined}
                data-allume={i < allumes || undefined}
                style={{ ['--i' as string]: i }}
              />
            )
          })}
        </g>
        {!fini ? (
          <g className="ec-cadran__aiguille" style={{ transform: `rotate(${angle}deg)` }}>
            <circle cx={C} cy={C - R_PISTE} r={4.5} />
          </g>
        ) : null}
      </svg>

      <div className="ec-cadran__centre" aria-hidden="true">
        {fini ? (
          <span className="ec-cadran__fin">{legendeFin}</span>
        ) : (
          <>
            {surtitre ? <span className="ec-cadran__sur">{surtitre}</span> : null}
            <span className="ec-cadran__chiffres">
              {chiffres.map(([n, u], k) => (
                <span key={u} className="ec-cadran__groupe">
                  {/* La clé suit la valeur : seul le chiffre qui change rejoue son entrée. */}
                  <b key={k === chiffres.length - 1 ? n : u}>{n}</b>
                  <small>{u}</small>
                </span>
              ))}
            </span>
            {legende ? <span className="ec-cadran__legende">{legende}</span> : null}
          </>
        )}
      </div>
      <span className="vh">
        {fini
          ? legendeFin
          : `${chiffres.map(([n, u]) => `${Number(n)} ${u === 'j' ? 'jours' : u === 'h' ? 'heures' : u === 'min' ? 'minutes' : 'secondes'}`).join(' ')}${legende ? `, ${legende}` : ''}`}
      </span>
    </div>
  )
}
