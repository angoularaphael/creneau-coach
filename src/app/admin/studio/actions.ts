'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { exigeSessionBackOffice } from '@/lib/admin/garde'
import {
  COOKIE_STUDIO,
  creerJetonStudio,
  optionsCookieStudio,
} from '@/lib/studio/session'

export async function actionOuvrirStudio() {
  await exigeSessionBackOffice('/admin/studio')
  ;(await cookies()).set(COOKIE_STUDIO, creerJetonStudio(), optionsCookieStudio())
  redirect('/admin/studio')
}

export async function actionFermerStudio() {
  await exigeSessionBackOffice('/admin')
  ;(await cookies()).set(COOKIE_STUDIO, '', { ...optionsCookieStudio(0), maxAge: 0 })
  redirect('/admin')
}
