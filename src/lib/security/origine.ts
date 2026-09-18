import 'server-only'

import { reponseErreur } from '@/lib/http/erreurs'

function hoteAttendu(): string | null {
  const brut = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim()
  if (!brut) return null
  try {
    return new URL(brut).host
  } catch {
    return null
  }
}

function hoteDe(valeur: string | null): string | null {
  if (!valeur) return null
  try {
    return new URL(valeur).host
  } catch {
    return null
  }
}

/**
 * CSRF navigateur : une mutation ne vient que de notre origine.
 *
 * En production, Origin (ou Referer / Sec-Fetch-Site) doit coller à SITE_URL.
 * Un POST cross-site n'emporte pas le cookie SameSite=Lax ; ce mur rattrape
 * les cas où Origin est présent et hostile, et le Host header forging.
 */
export function origineAutorisee(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  const attendu = hoteAttendu()
  if (!attendu) return false

  const fetchSite = (req.headers.get('sec-fetch-site') ?? '').toLowerCase()
  if (fetchSite === 'same-origin') return true

  const origin = hoteDe(req.headers.get('origin'))
  if (origin) return origin === attendu

  const referer = hoteDe(req.headers.get('referer'))
  if (referer) return referer === attendu

  return false
}

export function refusOrigine(req: Request, requestId: string): Response | null {
  if (origineAutorisee(req)) return null
  return reponseErreur('FORBIDDEN', {}, undefined, requestId)
}
