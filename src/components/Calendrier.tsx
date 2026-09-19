'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { ClubId, Slot } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import { createReservation, formatCents } from '@/lib/api/client';

/**
 * LE CALENDRIER — ce qui remplace les cartes.
 *
 * Une liste de cartes répond à « qu'est-ce qui est libre ? ». Elle ne répond
 * jamais à « à quoi ressemble ma semaine ? », qui est la vraie question d'un
 * coach qui cale trois clients. Sur une liste, un trou de deux heures le mardi
 * après-midi n'est visible que si on compte ; sur une grille, il saute aux yeux
 * sans lire une seule ligne.
 *
 * C'est aussi ce qui rend la surface exploitable : une grille peut porter la
 * densité, les cours du club, les maintiens en cours, les prix creux et pleins.
 * Une carte ne peut porter qu'elle-même.
 *
 * ── DEUX DISPOSITIONS, UN SEUL BALISAGE ───────────────────────────────────
 *
 * Sur téléphone, une grille de six jours donne des colonnes de quarante pixels :
 * illisible, et intouchable au pouce. La même liste s'affiche donc en agenda
 * vertical, un jour après l'autre. À partir de la tablette, elle bascule en
 * grille jour × heure.
 *
 * C'est la MÊME liste d'éléments dans les deux cas, réordonnée par la CSS. Pas
 * deux arbres rendus puis masqués l'un ou l'autre : un lecteur d'écran lirait
 * tout en double, et le navigateur téléchargerait les deux.
 *
 * ── L'HEURE EST CELLE DE PARIS ────────────────────────────────────────────
 *
 * Les créneaux arrivent en ISO. Le jour et l'heure d'affichage sont calculés
 * avec `timeZone: 'Europe/Paris'`, jamais avec l'heure locale du navigateur.
 * Un coach en déplacement ne doit pas voir sa réservation glisser d'une heure.
 */

const ETAT_LIBELLE: Record<Slot['state'], string> = {
  open: 'Libre',
  full: 'Complet',
  blocked: 'Cours du club',
  past: 'Passé',
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

const fmtJourCourt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
});
const fmtJourLong = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/** Les composantes d'une date, à Paris, sans passer par l'heure du navigateur. */
function partiesParis(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const heure = Number(v('hour'));
  const minute = Number(v('minute'));
  return {
    cleJour: `${v('year')}-${v('month')}-${v('day')}`,
    minutes: heure * 60 + minute,
    date: d,
  };
}

type Props = {
  clubId: ClubId;
  spaceId: string;
  slots: Slot[];
  loggedIn: boolean;
};

export function Calendrier({ clubId, spaceId, slots, loggedIn }: Props) {
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * L'amplitude horaire se DÉDUIT des créneaux, elle n'est pas écrite en dur.
   *
   * Le site annonçait « 10 h → 19 h » pendant que les plannings réels
   * descendent à 21 h 30. Une grille figée aurait coupé la soirée sans que
   * personne ne s'en aperçoive — le créneau n'aurait simplement pas existé à
   * l'écran. On prend donc les bornes de ce qui est réellement servi.
   */
  const modele = useMemo(() => {
    if (slots.length === 0) return null;

    const parJour = new Map<string, { date: Date; creneaux: Slot[] }>();
    let min = 24 * 60;
    let max = 0;

    for (const s of slots) {
      const d = partiesParis(s.starts_at);
      const f = partiesParis(s.ends_at);
      const finMinutes = f.minutes <= d.minutes ? 24 * 60 : f.minutes;
      min = Math.min(min, d.minutes);
      max = Math.max(max, finMinutes);
      const entree = parJour.get(d.cleJour) ?? { date: d.date, creneaux: [] };
      entree.creneaux.push(s);
      parJour.set(d.cleJour, entree);
    }

    const heureDebut = Math.floor(min / 60);
    const heureFin = Math.ceil(max / 60);
    const jours = [...parJour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cle, v]) => ({ cle, ...v }));

    return { jours, heureDebut, heureFin, nbHeures: heureFin - heureDebut };
  }, [slots]);

  async function reserver(slot: Slot) {
    if (!loggedIn) {
      router.push('/auth/connexion');
      return;
    }
    if (slot.state !== 'open') return;
    setErreur(null);
    setOccupe(slot.starts_at);
    try {
      const r = await createReservation({
        club_id: clubId,
        space_id: spaceId,
        starts_at: slot.starts_at,
      });
      router.push(`/espace-coach/reservations/${r.id}`);
    } catch (e) {
      setErreur(
        e instanceof ApiError
          ? e.message
          : 'La réservation n’a pas pu être enregistrée. Réessayez dans un instant.',
      );
      setOccupe(null);
    }
  }

  if (!modele) {
    return (
      <p className="muted">
        Aucune heure ouverte sur cette période. Changez de semaine ou d’espace.
      </p>
    );
  }

  const { jours, heureDebut, nbHeures } = modele;

  return (
    <>
      {erreur ? (
        <p className="form-error" role="alert">
          {erreur}
        </p>
      ) : null}

      <div className="cal" style={{ ['--jours' as string]: jours.length }}>
        {/* La colonne des heures. Absente du flux sur téléphone : chaque
            créneau y porte déjà son horaire en toutes lettres. */}
        <div className="cal__heures" aria-hidden="true">
          {Array.from({ length: nbHeures }, (_, i) => (
            <span className="cal__heure" key={i} style={{ ['--h' as string]: i }}>
              {String(heureDebut + i).padStart(2, '0')}h
            </span>
          ))}
        </div>

        {jours.map((jour) => {
          const nomJour = JOURS[jour.date.getDay()];
          return (
            <section className="cal__jour" key={jour.cle} aria-label={fmtJourLong.format(jour.date)}>
              <h3 className="cal__titre-jour">
                <span className="cal__jour-court">{fmtJourCourt.format(jour.date)}</span>
                <span className="cal__jour-long">{fmtJourLong.format(jour.date)}</span>
              </h3>

              {/* `--fin` donne à la piste la hauteur de l'amplitude réelle. */}
              <div className="cal__piste" style={{ ['--fin' as string]: nbHeures }}>
                {jour.creneaux.map((s) => {
                  const d = partiesParis(s.starts_at);
                  const f = partiesParis(s.ends_at);
                  const fin = f.minutes <= d.minutes ? 24 * 60 : f.minutes;
                  const haut = (d.minutes - heureDebut * 60) / 60;
                  const duree = Math.max((fin - d.minutes) / 60, 0.5);
                  const libre = s.state === 'open';
                  const heures = `${fmtHeure.format(new Date(s.starts_at))} – ${fmtHeure.format(new Date(s.ends_at))}`;

                  return (
                    <button
                      key={s.starts_at}
                      type="button"
                      className="cal__creneau"
                      data-etat={s.state}
                      style={{ ['--haut' as string]: haut, ['--duree' as string]: duree }}
                      disabled={!libre || occupe === s.starts_at}
                      onClick={() => reserver(s)}
                      aria-label={`${heures}, ${nomJour} — ${ETAT_LIBELLE[s.state]}${
                        libre ? `, ${formatCents(s.amount_cents)}` : ''
                      }`}
                    >
                      <span className="cal__h">{heures}</span>
                      {libre ? (
                        <span className="cal__prix">{formatCents(s.amount_cents)}</span>
                      ) : (
                        <span className="cal__etat">{ETAT_LIBELLE[s.state]}</span>
                      )}
                      {occupe === s.starts_at ? <span className="cal__attente">…</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="cal__legende">
        <span className="cal__pastille" data-etat="open" /> Libre
        <span className="cal__pastille" data-etat="full" /> Complet
        <span className="cal__pastille" data-etat="blocked" /> Cours du club
        <span className="cal__pastille" data-etat="past" /> Passé
      </p>
    </>
  );
}
