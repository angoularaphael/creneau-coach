/**
 * Affichage du QR et choix grant / revoke.
 * Fenêtre : [qr_valid_from, qr_valid_to). À l'heure de fin, l'accès est révoqué.
 */

export type Fenetre = 'trop_tot' | 'ouvert' | 'expire'

export function fenetreQr(nowMs: number, fromIso: string, toIso: string): Fenetre {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(nowMs) || !Number.isFinite(from) || !Number.isFinite(to)) return 'trop_tot'
  if (nowMs < from) return 'trop_tot'
  if (nowMs >= to) return 'expire'
  return 'ouvert'
}

export type AffichageQr = 'refus' | 'preparation' | 'afficher'

export function decisionAffichageQr(
  nowMs: number,
  fromIso: string,
  toIso: string,
  accessUrl: string | null | undefined,
): AffichageQr {
  if (fenetreQr(nowMs, fromIso, toIso) !== 'ouvert') return 'refus'
  if (!/^https?:\/\//i.test(String(accessUrl || '').trim())) return 'preparation'
  return 'afficher'
}

export type ActionBotCreneau = 'grant' | 'revoke' | 'rien'

export function actionBotPourReservation(
  nowMs: number,
  row: {
    readonly status: string
    readonly deciplus_job_status: string | null
    readonly qr_valid_from: string | null
    readonly qr_valid_to: string | null
  },
): ActionBotCreneau {
  if (row.status !== 'confirmed' || !row.qr_valid_from || !row.qr_valid_to) return 'rien'
  const fenetre = fenetreQr(nowMs, row.qr_valid_from, row.qr_valid_to)
  const statut = row.deciplus_job_status || 'none'
  if (fenetre === 'ouvert' && statut !== 'granted' && statut !== 'revoked') return 'grant'
  if (fenetre === 'expire' && statut === 'granted') return 'revoke'
  return 'rien'
}
