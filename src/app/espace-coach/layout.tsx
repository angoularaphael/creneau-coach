import type { ReactNode } from 'react'
import { studioActif } from '@/lib/studio/session'

export const dynamic = 'force-dynamic'

export default async function EspaceCoachLayout({ children }: { children: ReactNode }) {
  const test = await studioActif()
  return (
    <>
      {test ? (
        <p className="note" role="status" style={{ margin: '0.75rem 1rem' }}>
          Mode studio : Payplug TEST, pas d’argent réel. Éteindre depuis le
          back-office.
        </p>
      ) : null}
      {children}
    </>
  )
}
