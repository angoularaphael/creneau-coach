import 'server-only'

import { ipHash, type ContexteRequete } from '@/lib/security/request-context'

/** Contexte synthétique pour les Server Components (pas de Request). */
export function contextePage(route: string): ContexteRequete {
  return {
    requestId: `ssr_${crypto.randomUUID()}`,
    ip: 'unknown',
    ipHash: ipHash('unknown'),
    userAgent: '',
    methode: 'GET',
    route,
    cheminEtQuery: route,
  }
}
