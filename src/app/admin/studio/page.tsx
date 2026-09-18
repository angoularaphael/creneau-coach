import Link from 'next/link'

import { exigeSessionBackOffice } from '@/lib/admin/garde'
import { etatClesPaiement, studioActif } from '@/lib/studio/session'
import { actionFermerStudio, actionOuvrirStudio } from './actions'
import { actionSortir } from '../connexion/actions'

export const dynamic = 'force-dynamic'

export default async function PageStudio() {
  await exigeSessionBackOffice('/admin/studio')
  const on = await studioActif()
  const cles = etatClesPaiement()

  return (
    <>
      <p className="bo__bandeau">
        <strong>{on ? 'Studio allumé' : 'Studio éteint'}</strong>
        <span>
          {on
            ? 'Sur CE navigateur, Payer (Payplug) utilise les clés TEST. Pas d’argent réel.'
            : 'Les paiements du site utiliseraient les clés live. Allume le studio pour tester.'}
        </span>
        <span className="bo__actions">
          {on ? (
            <form action={actionFermerStudio}>
              <button className="bo__bouton bo__bouton--discret" type="submit">
                Éteindre
              </button>
            </form>
          ) : (
            <form action={actionOuvrirStudio}>
              <button className="bo__bouton" type="submit">
                Allumer le mode studio
              </button>
            </form>
          )}
          <Link className="bo__bouton bo__bouton--discret" href="/admin">
            Retour grille
          </Link>
          <form action={actionSortir}>
            <button className="bo__bouton bo__bouton--discret" type="submit">
              Sortir
            </button>
          </form>
        </span>
      </p>

      <h1>Comment ça marche</h1>
      <p className="bo__sous">
        Trois machines. Le site (Vercel) prend la résa et l’argent. Le bot
        (BotHosting) parle à Deciplus. Deciplus ouvre la porte de la salle. Le
        coach ne voit que le site.
      </p>

      <ol className="bo__etapes">
        <li>
          <strong>Réserver</strong> — le coach choisit un créneau. Le serveur
          bloque la place 10 min et fixe le prix. Personne ne tape le montant.
        </li>
        <li>
          <strong>Payer</strong> — carte Payplug (1×) ou un avoir. Le site
          n’écoute pas « j’ai payé » : Payplug rappelle le serveur. En studio,
          c’est le compte TEST Payplug.
        </li>
        <li>
          <strong>Signer</strong> — CGV, règlement, décharge. Ensuite seulement
          la résa est confirmée et un QR apparaît.
        </li>
        <li>
          <strong>Porte</strong> — le bot, avec le compte JUNIOR, donne l’accès
          Deciplus pour cette heure et cette salle, puis le retire. Ça, c’est
          encore à enchaîner (Playwright). Le QR côté site existe déjà.
        </li>
      </ol>

      <h2>Tester un paiement (studio)</h2>
      <ol className="bo__etapes">
        <li>Allume le studio ci-dessus (cookie 12 h, ce navigateur seulement).</li>
        <li>
          Va sur{' '}
          <Link href="/auth/connexion?next=/espace-coach">l’espace coach</Link>
          {' '}avec un compte coach (pas le back-office).
        </li>
        <li>Choisis un club → un créneau → Payer (Payplug TEST).</li>
        <li>
          Carte de test du portail Payplug (mode TEST), pas ta CB. Après succès,
          tu dois arriver à la signature.
        </li>
      </ol>

      <p className="bo__vide-texte">
        Payplug TEST {cles.payplugTest ? 'configuré' : 'manquant (PAYPLUG_TEST_SECRET_KEY)'}.
        Payplug live {cles.payplugLive ? 'présent (inutile tant que le studio est allumé)' : 'absent — tant mieux pour les essais'}.
        PayPal n’est pas encore branché sur ce checkout.
      </p>
    </>
  )
}
