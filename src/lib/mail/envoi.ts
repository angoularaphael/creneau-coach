import 'server-only'

/**
 * Tous les e-mails de la plateforme partent d'ici : no-reply@boxingcenter.fr,
 * par Resend (même canal que la boutique). Supabase ne crée que les jetons
 * d'inscription : il n'envoie plus rien. Les liens sont bâtis sur `urlPublique()`.
 */

const API_RESEND = 'https://api.resend.com/emails'
const EXPEDITEUR = 'no-reply@boxingcenter.fr'

export type PieceJointe = {
  readonly nom: string
  readonly contenuBase64: string
  readonly cid?: string
  readonly typeMime?: string
}

export type Courriel = {
  readonly a: string
  readonly sujet: string
  readonly html: string
  readonly texte: string
  /** Réponse du destinataire. Sinon l'adresse de réponse du compte Resend. */
  readonly reponse?: string
  readonly pieces?: readonly PieceJointe[]
}

export function mailConfigure(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

/**
 * L'adresse que les liens des e-mails désignent : celle où le site répond
 * vraiment. `SITE_URL` d'abord (le domaine servi), puis l'adresse publique
 * déclarée, puis l'adresse de production que Vercel fournit. localhost
 * n'apparaît qu'en développement, jamais dans un e-mail de production.
 */
export function urlPublique(): string {
  const candidates = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ]
  for (const brut of candidates) {
    const v = brut?.trim()
    if (!v) continue
    try {
      return new URL(v).origin
    } catch {
      continue
    }
  }
  if (process.env.NODE_ENV === 'production') throw new Error('SITE_URL manquant : aucun lien ne peut partir.')
  return `http://localhost:${process.env.PORT || 3041}`
}

function expediteur(): string {
  const nom = process.env.RESEND_SENDER_NAME?.trim() || 'Boxing Center'
  const adresse = process.env.RESEND_SENDER_EMAIL?.trim() || EXPEDITEUR
  return `${nom} <${adresse}>`
}

export async function envoyerCourriel(c: Courriel): Promise<{ ok: true } | { ok: false; raison: string }> {
  const cle = process.env.RESEND_API_KEY?.trim()
  if (!cle) return { ok: false, raison: 'resend_non_configure' }
  const reponse = c.reponse?.trim() || process.env.RESEND_REPLY_TO?.trim() || process.env.MAIL_REPLY_TO?.trim()
  try {
    const res = await fetch(API_RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: expediteur(),
        to: [c.a],
        ...(reponse ? { reply_to: reponse } : {}),
        subject: c.sujet,
        html: c.html,
        text: c.texte,
        ...(c.pieces?.length
          ? {
              attachments: c.pieces.map((p) => ({
                filename: p.nom,
                content: p.contenuBase64,
                ...(p.cid ? { content_id: p.cid } : {}),
                ...(p.typeMime ? { content_type: p.typeMime } : {}),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // Jamais le corps de la requête ni l'adresse dans le journal : seulement le code.
      return { ok: false, raison: `resend_${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.name : 'reseau' }
  }
}

function echapper(v: string): string {
  return v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Gabarit unique : le noir et le brun du site (tokens de boxing-center.css), un seul bouton.
 * Tableaux et styles en ligne — c'est ce que Gmail et Outlook savent afficher.
 */
export function gabarit(o: {
  titre: string
  paragraphes: readonly string[]
  bouton: { libelle: string; lien: string }
  apres?: string
  imageCid?: string
}): { html: string; texte: string } {
  const lien = echapper(o.bouton.lien)
  const paras = o.paragraphes
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#e6e6ea">${echapper(p)}</p>`)
    .join('')
  const image = o.imageCid
    ? `<tr><td style="padding:0 28px 20px" align="center"><img src="cid:${echapper(o.imageCid)}" alt="QR d acces" width="280" height="280" style="display:block;width:100%;max-width:280px;height:auto;border:0;background:#ffffff" /></td></tr>`
    : ''
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(o.titre)}</title></head>
<body style="margin:0;padding:0;background:#080808;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111218;border:1px solid #23253a;border-radius:10px">
<tr><td style="padding:28px 28px 8px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c98a4b;font-weight:700">Boxing Center · Coachs indépendants</td></tr>
<tr><td style="padding:8px 28px 4px"><h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#ffffff">${echapper(o.titre)}</h1>${paras}</td></tr>
${image}
<tr><td style="padding:4px 28px 24px"><a href="${lien}" style="display:inline-block;background:#c98a4b;color:#080808;text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:6px">${echapper(o.bouton.libelle)}</a></td></tr>
<tr><td style="padding:0 28px 24px;font-size:13px;line-height:1.5;color:#a8abc4">Le bouton ne s’ouvre pas ? Copiez ce lien dans votre navigateur :<br><a href="${lien}" style="color:#c98a4b;word-break:break-all">${lien}</a></td></tr>
${o.apres ? `<tr><td style="padding:0 28px 28px;font-size:13px;line-height:1.5;color:#a8abc4">${echapper(o.apres)}</td></tr>` : ''}
</table></td></tr></table></body></html>`
  const texte = [o.titre, '', ...o.paragraphes, '', `${o.bouton.libelle} : ${o.bouton.lien}`, ...(o.apres ? ['', o.apres] : [])].join('\n')
  return { html, texte }
}
