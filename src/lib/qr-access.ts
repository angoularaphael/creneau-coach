import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import QRCode from 'qrcode'

function secretQr(): string {
  const s = (process.env.QR_HMAC_SECRET ?? '').trim()
  if (!s || s.startsWith('change-me')) {
    throw new Error('QR_HMAC_SECRET manquant')
  }
  return s
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function nouvelJti(): string {
  return randomUUID()
}

export async function pngQr(jti: string, clubId: string, validFrom: string, validTo: string): Promise<string> {
  const payload = {
    jti,
    club_id: clubId,
    nbf: Math.floor(new Date(validFrom).getTime() / 1000),
    exp: Math.floor(new Date(validTo).getTime() / 1000),
  }
  const body = b64url(JSON.stringify(payload))
  const mac = b64url(createHmac('sha256', secretQr()).update(`v1.${body}`).digest())
  const token = `v1.${body}.${mac}`
  return QRCode.toDataURL(token, { margin: 1, width: 280 })
}

export function hmacEgal(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
