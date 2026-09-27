import { DocumentJuridique } from '@/components/DocumentJuridique'
import { metadataDeRoute } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = metadataDeRoute('/decharge-de-responsabilite')

/** Le texte en vigueur, figé à sa publication : voir `DocumentJuridique`. */
export default function Page() {
  return <DocumentJuridique type="decharge" visuel="decharge-de-responsabilite" />
}
