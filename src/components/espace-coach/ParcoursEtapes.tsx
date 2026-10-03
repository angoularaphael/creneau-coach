import type { ReactNode } from 'react'
import type { EtatEtape, Ton } from './parcours'
import { IcoCheck, IcoCroix, IcoCarte, IcoQr, IcoStylo } from './Icones'

/**
 * LE PARCOURS EN TROIS GESTES : Payer → Signer → Accès QR.
 *
 * Le même composant sert la carte de la liste (`mini`) et la fiche (`grand`).
 * Un seul dessin pour un seul parcours : si la liste et la fiche montraient la
 * progression de deux façons, le coach aurait deux choses à apprendre.
 *
 * Le filet entre deux gestes se REMPLIT jusqu'à l'étape en cours (le geste du
 * site) ; l'étape en cours respire doucement — « vous êtes ici » — et c'est la
 * seule chose qui bouge sur la carte. Une étape interrompue (délai écoulé,
 * annulation) se barre au lieu de disparaître : on comprend où ça s'est arrêté.
 */

const NOMS = ['Payer', 'Signer', 'Accès QR'] as const
const ICONES = [IcoCarte, IcoStylo, IcoQr] as const

export function Parcours({
  etats,
  details,
  taille = 'mini',
  etiquette = 'Avancement de la réservation',
}: {
  etats: readonly [EtatEtape, EtatEtape, EtatEtape]
  /** Une ligne sous chaque étape (version `grand`). */
  details?: readonly [ReactNode, ReactNode, ReactNode]
  taille?: 'mini' | 'grand'
  etiquette?: string
}) {
  // Jusqu'où le filet se remplit : jusqu'à l'étape en cours, ou tout si tout est fait.
  const courant = etats.indexOf('courant')
  const faits = etats.filter((e) => e === 'fait').length
  const rempli = courant >= 0 ? courant : faits === 3 ? 2 : Math.max(0, faits - 1)

  return (
    <ol
      className="ec-parcours"
      data-taille={taille}
      aria-label={etiquette}
      style={{ ['--rempli' as string]: rempli / 2 }}
    >
      {NOMS.map((nom, i) => {
        const etat = etats[i]!
        const Icone = ICONES[i]!
        return (
          <li key={nom} className="ec-parcours__etape" data-etat={etat} aria-current={etat === 'courant' ? 'step' : undefined}>
            <span className="ec-parcours__puce" aria-hidden="true">
              {etat === 'fait' ? <IcoCheck taille={taille === 'grand' ? 18 : 12} /> : null}
              {etat === 'rompu' ? <IcoCroix taille={taille === 'grand' ? 16 : 11} /> : null}
              {etat === 'courant' || etat === 'avenir' ? (
                taille === 'grand' ? <Icone taille={17} /> : <span className="ec-parcours__n">{i + 1}</span>
              ) : null}
            </span>
            <span className="ec-parcours__nom">
              {nom}
              <span className="vh">
                {' '}
                : {etat === 'fait' ? 'fait' : etat === 'courant' ? 'étape en cours' : etat === 'rompu' ? 'interrompu' : 'à venir'}
              </span>
            </span>
            {taille === 'grand' && details?.[i] ? <span className="ec-parcours__detail">{details[i]}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

/** La pastille de statut. La couleur n'est jamais seule : le mot dit tout. */
export function Pastille({ ton, children }: { ton: Ton; children: ReactNode }) {
  return (
    <span className="ec-pastille" data-ton={ton}>
      <span className="ec-pastille__point" aria-hidden="true" />
      {children}
    </span>
  )
}
