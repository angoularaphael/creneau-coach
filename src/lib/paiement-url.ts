/**
 * URL de checkout prestataire — utilisable navigateur ET serveur.
 * `window.location` ne doit jamais suivre une URL hors de cette liste.
 */
const HOTES = [
  'secure.payplug.com',
  'payplug.com',
  'www.paypal.com',
  'paypal.com',
  'www.sandbox.paypal.com',
]

function hoteAutorise(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return HOTES.some((autorise) => h === autorise || h.endsWith(`.${autorise}`))
}

export function estUrlCheckoutSure(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && hoteAutorise(u.hostname)
  } catch {
    return false
  }
}
