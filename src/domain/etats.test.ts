/**
 * Tests de la machine à états — LOT C.
 *
 * Le test central est U8 : les 8 × 8 couples de statuts × 5 acteurs, soit 320
 * combinaisons, chacune éprouvée sous 48 jeux de faits. Une transition ne peut
 * devenir légale que si elle figure dans `TRANSITIONS_LEGALES`. Si quelqu'un
 * ajoute un `case` au `switch` sans l'inscrire dans la table, ce test casse — et
 * c'est l'effet recherché.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSee,
  canTransition,
  limiteAnnulationMs,
  peutPoserUnHold,
  STATUTS_TERMINAUX,
  TRANSITIONS_LEGALES,
  type Acteur,
  type ContexteCreation,
  type Decision,
  type Faits,
  // @ts-expect-error TS5097 -- Node exige l'extension .ts (voir l'en-tête de horloge.ts).
} from './etats.ts'
import {
  CODES_ERREUR,
  STATUTS,
  type Statut,
  type StatutPaiement,
  type StatutSignature,
  // @ts-expect-error TS5097 -- idem.
} from './contrat.ts'
// @ts-expect-error TS5097 -- idem.
import { occupeUnSiege } from './creneaux.ts'

const MAINTENANT = 1_800_000_000_000
const COACH_A = 'coach-a'
const COACH_B = 'coach-b'
const CLUB = 'minimes'
const HEURE = 3_600_000

const PROPRIETAIRE: Acteur = { genre: 'coach', id: COACH_A, suspendu: false }
const SUSPENDU: Acteur = { genre: 'coach', id: COACH_A, suspendu: true }
const AUTRE_COACH: Acteur = { genre: 'coach', id: COACH_B, suspendu: false }
const MANAGER: Acteur = { genre: 'manager', clubId: CLUB }
const MANAGER_AILLEURS: Acteur = { genre: 'manager', clubId: 'portet' }
const DIRECTION: Acteur = { genre: 'direction' }
const SERVICE: Acteur = { genre: 'service' }
const CRON: Acteur = { genre: 'cron' }

/** Acteurs qui voient la réservation : la visibilité est testée à part. */
const ACTEURS_VOYANTS: readonly Acteur[] = [PROPRIETAIRE, MANAGER, DIRECTION, SERVICE, CRON]

function faits(surcharge: Partial<Faits> = {}): Faits {
  return {
    maintenant: MAINTENANT,
    coachId: COACH_A,
    clubId: CLUB,
    debutMs: MAINTENANT + 48 * HEURE,
    finMs: MAINTENANT + 49 * HEURE,
    holdExpireMs: MAINTENANT + 600_000,
    paiement: 'paid',
    signature: 'signed',
    heuresMiniAnnulation: 24,
    ...surcharge,
  }
}

/** Les 48 jeux de faits : tout ce qui peut faire basculer une garde. */
function variantes(): Faits[] {
  const sortie: Faits[] = []
  const holds: (number | null)[] = [MAINTENANT - 1, MAINTENANT + 600_000, null]
  const paiements: StatutPaiement[] = ['unpaid', 'paid', 'failed', 'waived_credit']
  const signatures: StatutSignature[] = ['none', 'signed']
  const creneaux: Array<Pick<Faits, 'debutMs' | 'finMs'>> = [
    { debutMs: MAINTENANT + 48 * HEURE, finMs: MAINTENANT + 49 * HEURE }, // à venir
    { debutMs: MAINTENANT - 49 * HEURE, finMs: MAINTENANT - 48 * HEURE }, // écoulé
  ]
  for (const holdExpireMs of holds) {
    for (const paiement of paiements) {
      for (const signature of signatures) {
        for (const creneau of creneaux) {
          sortie.push(faits({ holdExpireMs, paiement, signature, ...creneau }))
        }
      }
    }
  }
  return sortie
}

function cleLegale(de: Statut, vers: Statut, genre: Acteur['genre']): string {
  return `${de}->${vers}|${genre}`
}

const LEGALES = new Set<string>()
for (const t of TRANSITIONS_LEGALES) {
  if (t.de === null) continue // T1 : création, traitée par `peutPoserUnHold`
  for (const genre of t.acteurs) LEGALES.add(cleLegale(t.de, t.vers, genre))
}

test('U8 — exhaustif : 8 × 8 couples × 5 acteurs, et rien hors des douze transitions', () => {
  const jeux = variantes()
  assert.equal(jeux.length, 48)
  let combinaisons = 0

  for (const de of STATUTS) {
    for (const vers of STATUTS) {
      for (const acteur of ACTEURS_VOYANTS) {
        combinaisons++
        const attenduLegal = LEGALES.has(cleLegale(de, vers, acteur.genre))
        let auMoinsUnOk = false

        for (const f of jeux) {
          const d: Decision = canTransition(de, vers, acteur, f)
          if (d.ok) {
            auMoinsUnOk = true
            assert.equal(
              attenduLegal,
              true,
              `transition illégale acceptée : ${de} -> ${vers} par ${acteur.genre}`,
            )
          } else {
            // Le statut HTTP n'est jamais choisi sur place : il vient du contrat.
            assert.equal(d.http, CODES_ERREUR[d.code], `${de}->${vers}|${acteur.genre}`)
          }
        }

        if (attenduLegal) {
          assert.equal(
            auMoinsUnOk,
            true,
            `transition légale jamais acceptée : ${de} -> ${vers} par ${acteur.genre}`,
          )
        }
      }
    }
  }
  assert.equal(combinaisons, STATUTS.length * STATUTS.length * ACTEURS_VOYANTS.length)
  assert.equal(combinaisons, 320)
})

test('U8bis — le manager de salle n’écrit jamais sur une réservation', () => {
  for (const de of STATUTS) {
    for (const vers of STATUTS) {
      const d = canTransition(de, vers, MANAGER, faits())
      assert.deepEqual(d, {
        ok: false,
        code: 'FORBIDDEN',
        http: 403,
        detail: 'manager_read_only',
      })
    }
  }
})

test('anti-IDOR : hors périmètre ⇒ 404, jamais 403, et toujours le même corps', () => {
  const dAutreCoach = canTransition('confirmed', 'cancelled_credit', AUTRE_COACH, faits())
  const dAutreManager = canTransition('confirmed', 'cancelled_credit', MANAGER_AILLEURS, faits())
  const attendu = { ok: false, code: 'NOT_FOUND', http: 404 }
  assert.deepEqual(dAutreCoach, attendu)
  assert.deepEqual(dAutreManager, attendu)

  // Le coach B n'apprend RIEN, quelle que soit la transition tentée : ni que la
  // réservation existe, ni qu'elle est dans tel état, ni qu'elle appartient à A.
  const corps = new Set<string>()
  for (const de of STATUTS) {
    for (const vers of STATUTS) {
      corps.add(JSON.stringify(canTransition(de, vers, AUTRE_COACH, faits())))
    }
  }
  assert.equal(corps.size, 1, 'une réponse varie selon l’état : c’est un oracle')

  assert.equal(canSee(PROPRIETAIRE, faits()), true)
  assert.equal(canSee(AUTRE_COACH, faits()), false)
  assert.equal(canSee(MANAGER, faits()), true)
  assert.equal(canSee(MANAGER_AILLEURS, faits()), false)
  for (const a of [DIRECTION, SERVICE, CRON]) assert.equal(canSee(a, faits()), true)
})

test('la visibilité passe AVANT la suspension : un coach suspendu n’énumère rien', () => {
  const suspenduEtranger: Acteur = { genre: 'coach', id: COACH_B, suspendu: true }
  assert.deepEqual(canTransition('confirmed', 'cancelled_credit', suspenduEtranger, faits()), {
    ok: false,
    code: 'NOT_FOUND',
    http: 404,
  })
})

test('13.12 — un coach suspendu est refusé sur toute écriture, avec 403 SUSPENDED', () => {
  for (const [de, vers] of [
    ['held', 'expired'],
    ['confirmed', 'cancelled_credit'],
    ['awaiting_signature', 'cancelled_credit'],
  ] as const) {
    assert.deepEqual(canTransition(de, vers, SUSPENDU, faits()), {
      ok: false,
      code: 'SUSPENDED',
      http: 403,
    })
    // Le même acteur non suspendu passe : le refus vient bien de la suspension.
    assert.deepEqual(canTransition(de, vers, PROPRIETAIRE, faits()), { ok: true })
  }
})

test('T6 — la barrière : `confirmed` exige payé ET signé, et seul le service la pose', () => {
  assert.deepEqual(
    canTransition('awaiting_signature', 'confirmed', SERVICE, faits({ paiement: 'unpaid' })),
    { ok: false, code: 'PAYMENT_REQUIRED', http: 409 },
  )
  assert.deepEqual(
    canTransition(
      'awaiting_signature',
      'confirmed',
      SERVICE,
      faits({ paiement: 'paid', signature: 'none' }),
    ),
    { ok: false, code: 'SIGNATURE_REQUIRED', http: 409 },
  )
  assert.deepEqual(
    canTransition('awaiting_signature', 'confirmed', SERVICE, faits({ paiement: 'waived_credit' })),
    { ok: true },
    'un avoir solde la réservation aussi bien qu’une carte',
  )
  for (const acteur of [PROPRIETAIRE, DIRECTION, CRON]) {
    assert.deepEqual(canTransition('awaiting_signature', 'confirmed', acteur, faits()), {
      ok: false,
      code: 'FORBIDDEN',
      http: 403,
    })
  }
})

test('`held -> confirmed` court-circuiterait paiement ET signature : toujours refusé', () => {
  for (const acteur of [PROPRIETAIRE, DIRECTION, SERVICE, CRON]) {
    assert.deepEqual(canTransition('held', 'confirmed', acteur, faits()), {
      ok: false,
      code: 'CONFLICT',
      http: 409,
      detail: 'held->confirmed',
    })
  }
})

test('T2 — un paiement encaissé après la mort du hold ne confirme rien tout seul', () => {
  assert.deepEqual(
    canTransition('held', 'awaiting_signature', SERVICE, faits({ holdExpireMs: MAINTENANT - 1 })),
    { ok: false, code: 'HOLD_EXPIRED', http: 409 },
  )
  assert.deepEqual(
    canTransition('held', 'awaiting_signature', SERVICE, faits({ holdExpireMs: MAINTENANT })),
    { ok: false, code: 'HOLD_EXPIRED', http: 409 },
    'à la milliseconde près, le hold est mort',
  )
  assert.deepEqual(
    canTransition('held', 'awaiting_signature', SERVICE, faits({ paiement: 'unpaid' })),
    { ok: false, code: 'PAYMENT_REQUIRED', http: 409 },
  )
  assert.deepEqual(canTransition('held', 'awaiting_signature', SERVICE, faits()), { ok: true })
})

test('T4 / T5 — le cron n’expire qu’un hold réellement mort ; le coach abandonne quand il veut', () => {
  assert.deepEqual(canTransition('held', 'expired', CRON, faits({ holdExpireMs: MAINTENANT - 1 })), {
    ok: true,
  })
  assert.deepEqual(canTransition('held', 'expired', CRON, faits()), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'hold_still_alive',
  })
  assert.deepEqual(canTransition('held', 'expired', CRON, faits({ holdExpireMs: null })), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'hold_still_alive',
  })
  assert.deepEqual(canTransition('held', 'expired', PROPRIETAIRE, faits()), { ok: true })
  assert.deepEqual(canTransition('held', 'expired', DIRECTION, faits()), { ok: true })
  assert.deepEqual(canTransition('held', 'expired', SERVICE, faits()), {
    ok: false,
    code: 'FORBIDDEN',
    http: 403,
  })
})

test('13.11 — la frontière des 24 heures ABSOLUES, à la minute près', () => {
  const limite = (heures: number, minutes = 0): Decision =>
    canTransition(
      'confirmed',
      'cancelled_credit',
      PROPRIETAIRE,
      faits({
        debutMs: MAINTENANT + heures * HEURE + minutes * 60_000,
        finMs: MAINTENANT + (heures + 1) * HEURE,
      }),
    )

  assert.deepEqual(limite(25), { ok: true })
  assert.deepEqual(limite(24, 1), { ok: true })
  assert.deepEqual(limite(24), { ok: false, code: 'CANCEL_TOO_LATE', http: 409 })
  assert.deepEqual(limite(23, 59), { ok: false, code: 'CANCEL_TOO_LATE', http: 409 })
  assert.deepEqual(limite(23), { ok: false, code: 'CANCEL_TOO_LATE', http: 409 })

  // La limite est une DURÉE (§1.6, option A) : jamais « la même heure la veille ».
  const f = faits({ debutMs: MAINTENANT + 48 * HEURE })
  assert.equal(limiteAnnulationMs(f), f.debutMs - 24 * HEURE)
  // Un réglage direction différent est respecté sans toucher au code.
  const f12 = faits({ debutMs: MAINTENANT + 48 * HEURE, heuresMiniAnnulation: 12 })
  assert.equal(limiteAnnulationMs(f12), f12.debutMs - 12 * HEURE)
})

test('T7 / T8 — seuls le propriétaire et la direction annulent', () => {
  for (const de of ['awaiting_signature', 'confirmed'] as const) {
    assert.deepEqual(canTransition(de, 'cancelled_credit', PROPRIETAIRE, faits()), { ok: true })
    assert.deepEqual(canTransition(de, 'cancelled_credit', DIRECTION, faits()), { ok: true })
    const autres: Acteur[] = [SERVICE, CRON]
    for (const acteur of autres) {
      assert.deepEqual(canTransition(de, 'cancelled_credit', acteur, faits()), {
        ok: false,
        code: 'FORBIDDEN',
        http: 403,
      })
    }
  }
})

test('T9 / T10 — on ne consomme ni ne pointe une séance qui n’est pas finie', () => {
  const passe = faits({ debutMs: MAINTENANT - 49 * HEURE, finMs: MAINTENANT - 48 * HEURE })
  assert.deepEqual(canTransition('confirmed', 'consumed', CRON, passe), { ok: true })
  assert.deepEqual(canTransition('confirmed', 'consumed', DIRECTION, passe), { ok: true })
  assert.deepEqual(canTransition('confirmed', 'consumed', CRON, faits()), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'slot_not_over',
  })
  assert.deepEqual(canTransition('confirmed', 'no_show', DIRECTION, passe), { ok: true })
  assert.deepEqual(canTransition('confirmed', 'no_show', CRON, passe), {
    ok: false,
    code: 'FORBIDDEN',
    http: 403,
  })
  assert.deepEqual(canTransition('confirmed', 'no_show', DIRECTION, faits()), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'slot_not_over',
  })
})

test('T11 — payé, jamais signé, créneau passé : le cron expire, personne d’autre', () => {
  const passeNonSigne = faits({
    debutMs: MAINTENANT - 49 * HEURE,
    finMs: MAINTENANT - 48 * HEURE,
    signature: 'none',
  })
  assert.deepEqual(canTransition('awaiting_signature', 'expired', CRON, passeNonSigne), { ok: true })
  assert.deepEqual(
    canTransition('awaiting_signature', 'expired', CRON, { ...passeNonSigne, signature: 'signed' }),
    { ok: false, code: 'CONFLICT', http: 409, detail: 'already_signed' },
  )
  assert.deepEqual(canTransition('awaiting_signature', 'expired', CRON, faits({ signature: 'none' })), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'slot_not_over',
  })
  assert.deepEqual(canTransition('awaiting_signature', 'expired', PROPRIETAIRE, passeNonSigne), {
    ok: false,
    code: 'FORBIDDEN',
    http: 403,
  })
})

test('T12 — un `no_show` reste corrigible par la direction, et par elle seule', () => {
  assert.deepEqual(canTransition('no_show', 'consumed', DIRECTION, faits()), { ok: true })
  for (const acteur of [PROPRIETAIRE, SERVICE, CRON]) {
    assert.deepEqual(canTransition('no_show', 'consumed', acteur, faits()), {
      ok: false,
      code: 'FORBIDDEN',
      http: 403,
    })
  }
  // Mais rien d’autre ne sort de `no_show`.
  assert.deepEqual(canTransition('no_show', 'cancelled_credit', DIRECTION, faits()), {
    ok: false,
    code: 'CONFLICT',
    http: 409,
    detail: 'no_show->cancelled_credit',
  })
})

test('les états terminaux sont terminaux, pour tout le monde', () => {
  assert.deepEqual([...STATUTS_TERMINAUX].sort(), [
    'cancelled_credit',
    'consumed',
    'expired',
    'payment_failed',
  ])
  for (const de of STATUTS_TERMINAUX) {
    for (const vers of STATUTS) {
      const tous: Acteur[] = [PROPRIETAIRE, DIRECTION, SERVICE, CRON]
      for (const acteur of tous) {
        assert.deepEqual(canTransition(de, vers, acteur, faits()), {
          ok: false,
          code: 'CONFLICT',
          http: 409,
          detail: `terminal:${de}`,
        })
      }
    }
  }
})

// ---------------------------------------------------------------------------
// T1 — poser un hold
// ---------------------------------------------------------------------------

function contexte(surcharge: Partial<ContexteCreation> = {}): ContexteCreation {
  return {
    creneauInvalide: false,
    bloque: false,
    pris: 0,
    capacite: 2,
    activesDuCoach: 0,
    maxActives: 3,
    dejaReserveParCeCoach: false,
    ...surcharge,
  }
}

const CREATION = { maintenant: MAINTENANT, debutMs: MAINTENANT + 48 * HEURE, coachId: COACH_A }

test('T1 — le chemin nominal, et chaque garde dans son ordre', () => {
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte()), { ok: true })

  assert.deepEqual(peutPoserUnHold(SUSPENDU, CREATION, contexte()), {
    ok: false,
    code: 'SUSPENDED',
    http: 403,
  })
  assert.deepEqual(peutPoserUnHold(AUTRE_COACH, CREATION, contexte()), {
    ok: false,
    code: 'FORBIDDEN',
    http: 403,
  })
  for (const acteur of [MANAGER, DIRECTION, SERVICE, CRON]) {
    assert.deepEqual(peutPoserUnHold(acteur, CREATION, contexte()), {
      ok: false,
      code: 'FORBIDDEN',
      http: 403,
    })
  }
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ creneauInvalide: true })), {
    ok: false,
    code: 'VALIDATION_ERROR',
    http: 400,
  })
  assert.deepEqual(
    peutPoserUnHold(
      PROPRIETAIRE,
      { ...CREATION, debutMs: MAINTENANT - 1 },
      contexte(),
    ),
    { ok: false, code: 'VALIDATION_ERROR', http: 400, detail: 'past' },
  )
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ bloque: true })), {
    ok: false,
    code: 'SLOT_BLOCKED',
    http: 409,
  })
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ activesDuCoach: 3 })), {
    ok: false,
    code: 'ACTIVE_LIMIT',
    http: 409,
  })
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ pris: 2 })), {
    ok: false,
    code: 'SLOT_FULL',
    http: 409,
  })
})

test('Q10 — recliquer sur son propre créneau rend CONFLICT, surtout pas SLOT_FULL', () => {
  const d = peutPoserUnHold(
    PROPRIETAIRE,
    CREATION,
    contexte({ pris: 2, dejaReserveParCeCoach: true }),
  )
  assert.deepEqual(d, { ok: false, code: 'CONFLICT', http: 409, detail: 'already_booked' })
})

test('un blocage prime la capacité : on ne dit pas « complet » d’un créneau interdit', () => {
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ bloque: true, pris: 2 })), {
    ok: false,
    code: 'SLOT_BLOCKED',
    http: 409,
  })
})

test('13.10 — trois holds MORTS ne verrouillent personne hors de la plateforme', () => {
  // `activesDuCoach` se compte sur le prédicat d'occupation, jamais sur le statut
  // seul : c'est ce qui rend le cron facultatif pour la correction.
  const troisHoldsMorts = [
    { statut: 'held' as const, holdExpireMs: MAINTENANT - 1 },
    { statut: 'held' as const, holdExpireMs: MAINTENANT - 60_000 },
    { statut: 'held' as const, holdExpireMs: MAINTENANT - 600_000 },
  ]
  const actives = troisHoldsMorts.filter((r) => occupeUnSiege(r, MAINTENANT)).length
  assert.equal(actives, 0)
  assert.deepEqual(
    peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ activesDuCoach: actives })),
    { ok: true },
  )

  // Trois holds VIVANTS, en revanche, ferment bien la porte.
  const troisVivants = [
    { statut: 'held' as const, holdExpireMs: MAINTENANT + 1 },
    { statut: 'awaiting_signature' as const, holdExpireMs: null },
    { statut: 'confirmed' as const, holdExpireMs: null },
  ]
  const actives2 = troisVivants.filter((r) => occupeUnSiege(r, MAINTENANT)).length
  assert.equal(actives2, 3)
  assert.deepEqual(peutPoserUnHold(PROPRIETAIRE, CREATION, contexte({ activesDuCoach: actives2 })), {
    ok: false,
    code: 'ACTIVE_LIMIT',
    http: 409,
  })
})

test('la table des transitions et le switch disent la même chose', () => {
  assert.equal(TRANSITIONS_LEGALES.length, 12)
  const identifiants = TRANSITIONS_LEGALES.map((t) => t.id)
  assert.equal(new Set(identifiants).size, 12)
  // Chaque ligne de la table est réellement atteignable (hors T1, testée plus haut).
  for (const t of TRANSITIONS_LEGALES) {
    if (t.de === null) continue
    assert.ok(t.acteurs.length > 0, t.id)
    for (const genre of t.acteurs) {
      assert.ok(LEGALES.has(cleLegale(t.de, t.vers, genre)), `${t.id}/${genre}`)
    }
  }
})
