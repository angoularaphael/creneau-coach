'use client'

import { IcoAgenda } from './Icones'

/**
 * « AJOUTER À MON AGENDA » — un fichier .ics fabriqué dans le navigateur.
 *
 * Un coach vit dans son agenda, pas dans notre tableau de bord. Sans ce bouton,
 * il recopiait l'heure et l'adresse à la main — et c'est là qu'on se trompe de
 * club. Le fichier est construit ICI, à partir de ce que la page affiche déjà :
 * aucun appel serveur, aucune donnée nouvelle, rien qui sorte du téléphone.
 *
 * Il porte un rappel 30 minutes avant, et le lien direct vers le QR d'accès :
 * à l'heure dite, la notification de l'agenda mène à la porte en un geste.
 */

/** RFC 5545 : virgules, points-virgules et barres obliques inverses s'échappent. */
const echapper = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n')

/** `20261003T080000Z` — l'heure UTC, sans ambiguïté de fuseau pour l'agenda. */
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function AjouterAgenda({
  id,
  debut,
  fin,
  titre,
  lieu,
}: {
  id: string
  debut: string
  fin: string
  titre: string
  lieu: string
}) {
  function telecharger() {
    const lienQr = `${window.location.origin}/espace-coach/reservations/${id}/qr`
    const lignes = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Boxing Center//Coachs//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${id}@coachs.boxingcenter.fr`,
      `DTSTAMP:${utc(new Date().toISOString())}`,
      `DTSTART:${utc(debut)}`,
      `DTEND:${utc(fin)}`,
      `SUMMARY:${echapper(titre)}`,
      `LOCATION:${echapper(lieu)}`,
      `DESCRIPTION:${echapper(`Votre QR d’accès ouvre la porte 5 minutes avant : ${lienQr}`)}`,
      `URL:${lienQr}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT30M',
      `DESCRIPTION:${echapper(titre)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
    const blob = new Blob([lignes.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seance-boxing-center-${debut.slice(0, 10)}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" className="ec-lien ec-agenda" onClick={telecharger}>
      <IcoAgenda taille={17} />
      Ajouter à mon agenda
    </button>
  )
}
