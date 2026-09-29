'use strict';

/**
 * Fenêtre de la vente Badge : le créneau choisi par le coach.
 * Début = starts_at (heure de Paris). Fin = ends_at. La durée est l'écart
 * entre les deux, pas la durée catalogue du produit Deciplus.
 */

function lireChamp(job, cle) {
  if (job && job[cle]) return String(job[cle]);
  if (job && job.reservation && job.reservation[cle]) return String(job.reservation[cle]);
  return '';
}

function formatParis(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const lire = (type) => parts.find((p) => p.type === type)?.value || '';
  const heure = lire('hour') === '24' ? '00' : lire('hour');
  return `${lire('day')}/${lire('month')}/${lire('year')} ${heure}:${lire('minute')}`;
}

function erreur(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bornesVenteBadge(job) {
  const debutIso = lireChamp(job, 'starts_at');
  const finIso = lireChamp(job, 'ends_at');
  if (!debutIso || !finIso) {
    throw erreur('Créneau sans starts_at / ends_at — vente badge refusée', 'BADGE_CRENEAU_ABSENT');
  }
  const debutMs = new Date(debutIso).getTime();
  const finMs = new Date(finIso).getTime();
  const dureeMinutes = Math.round((finMs - debutMs) / 60000);
  if (!Number.isFinite(dureeMinutes) || dureeMinutes <= 0) {
    throw erreur('Durée de créneau invalide', 'BADGE_DUREE_INVALIDE');
  }
  const debutFr = formatParis(debutIso);
  const finFr = formatParis(finIso);
  if (!debutFr || !finFr) {
    throw erreur('Dates de créneau illisibles', 'BADGE_DUREE_INVALIDE');
  }
  return { debutIso, finIso, debutFr, finFr, dureeMinutes };
}

module.exports = { bornesVenteBadge, formatParis };
