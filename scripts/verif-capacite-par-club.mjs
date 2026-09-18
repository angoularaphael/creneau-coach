#!/usr/bin/env node
/**
 * Preuve du défaut D-C05 : la capacité est par CLUB, pas partagée entre clubs.
 *
 * `space_id = 'salle'` existe à Minimes, St-Cyprien ET Ramonville. Le cahier §3.5
 * écrit la clé de capacité « (space_id, starts_at) ». Appliquée telle quelle, deux
 * coachs à Minimes 11h auraient rempli la salle de Ramonville et celle de St-Cyprien.
 *
 * Ce test n'est dans aucun des 13 tests contractuels du cahier §13 : il vérifie une
 * chose que le cahier croyait acquise.
 *
 *   node scripts/verif-capacite-par-club.mjs
 */

import { randomUUID } from 'node:crypto'
import pg from 'pg'

const URL = process.argv[2] ?? 'postgres://postgres@127.0.0.1:5432/creneau_coach_verif'

// Mardi 22 septembre 2026, 11h00 Paris (heure d'été → +02:00). Heure creuse : 1000 c.
const CRENEAU = '2026-09-22T11:00:00+02:00'

let reussis = 0
let echoues = 0

function verifier(intitule, condition, detail = '') {
  if (condition) {
    reussis++
    console.log(`  ✓ ${intitule}`)
  } else {
    echoues++
    console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ''}`)
  }
}

/**
 * Une transaction EXPLICITE par appel — ce n'est pas du confort.
 * `set_config(..., true)` est local à la transaction ; node-pg valide chaque requête
 * séparément, donc les claims disparaîtraient avant l'appel de la fonction.
 * C'est exactement ainsi que PostgREST procède : claims puis appel, même transaction.
 */
async function hold(client, coachId, clubId, spaceId) {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: coachId, role: 'authenticated', app_metadata: { role: 'coach' } }),
    ])
    const { rows } = await client.query(
      'select public.coach_create_hold($1, $2, $3::timestamptz, $4) as r',
      [clubId, spaceId, CRENEAU, randomUUID()],
    )
    await client.query('commit')
    return rows[0].r
  } catch (e) {
    await client.query('rollback')
    throw e
  }
}

async function main() {
  const client = new pg.Client({ connectionString: URL })
  await client.connect()

  // Quatre coachs de test, propres à cette exécution.
  const coachs = Array.from({ length: 4 }, () => randomUUID())
  for (const [i, id] of coachs.entries()) {
    const email = `coach${i + 1}.${id.slice(0, 8)}@exemple.test`
    // coach_profiles.id référence auth.users(id) — fidèle à Supabase, y compris en local.
    await client.query(
      `insert into auth.users (id, email, raw_app_meta_data)
       values ($1, $2, jsonb_build_object('role', 'coach'))`,
      [id, email],
    )
    await client.query(
      `insert into public.coach_profiles (id, first_name, last_name, email, status)
       values ($1, $2, 'Test', $3, 'active')`,
      [id, `Coach${i + 1}`, email],
    )
  }
  await client.query('delete from public.coach_reservations where starts_at = $1::timestamptz', [CRENEAU])

  console.log(`\nCréneau de test : ${CRENEAU} (mardi, heure creuse)\n`)

  console.log('On remplit la salle de Minimes — capacité 2 :')
  const m1 = await hold(client, coachs[0], 'minimes', 'salle')
  verifier('coach 1 à Minimes → hold créé', m1.ok === true, JSON.stringify(m1.error ?? {}))
  verifier('   prix figé par le serveur à 1000 c (heure creuse)', m1.ok && m1.reservation.amount_cents === 1000,
    `reçu : ${m1.ok ? m1.reservation.amount_cents : 'n/a'}`)

  const m2 = await hold(client, coachs[1], 'minimes', 'salle')
  verifier('coach 2 à Minimes → hold créé', m2.ok === true, JSON.stringify(m2.error ?? {}))

  // `seat` est un détail d'implémentation : il n'est PAS au contrat (openapi.yaml,
  // schéma Reservation) et la fonction a raison de ne pas le renvoyer. On le vérifie
  // donc en base, pas dans le payload — et on vérifie aussi qu'il n'en sort pas.
  verifier("   le payload ne fuit pas le numéro de siège (hors contrat)",
    m1.ok && m1.reservation.seat === undefined)
  const { rows: sieges } = await client.query(
    `select seat from public.coach_reservations
      where club_id = 'minimes' and space_id = 'salle' and starts_at = $1::timestamptz
        and status = 'held' order by seat`,
    [CRENEAU],
  )
  verifier('   les deux sièges attribués sont 1 et 2',
    sieges.length === 2 && sieges[0].seat === 1 && sieges[1].seat === 2,
    `sièges en base : ${JSON.stringify(sieges.map((s) => s.seat))}`)

  const m3 = await hold(client, coachs[2], 'minimes', 'salle')
  verifier('coach 3 à Minimes → SLOT_FULL', m3.ok === false && m3.error?.code === 'SLOT_FULL',
    `reçu : ${JSON.stringify(m3.error ?? m3)}`)

  console.log('\nMinimes est plein. LE TEST : les autres clubs sont-ils touchés ?')
  const r1 = await hold(client, coachs[2], 'ramonville', 'salle')
  verifier("Ramonville / 'salle' à la même heure → hold créé", r1.ok === true,
    `reçu : ${JSON.stringify(r1.error ?? {})}  ← si SLOT_FULL ici, la capacité est partagée entre clubs`)

  const s1 = await hold(client, coachs[3], 'st-cyprien', 'salle')
  verifier("St-Cyprien / 'salle' à la même heure → hold créé", s1.ok === true,
    `reçu : ${JSON.stringify(s1.error ?? {})}`)

  const { rows: repartition } = await client.query(
    `select club_id, space_id, count(*)::int as pris
       from public.coach_reservations
      where starts_at = $1::timestamptz and status = 'held'
      group by club_id, space_id order by club_id`,
    [CRENEAU],
  )
  console.log('\nOccupation réelle à 11h :')
  for (const l of repartition) console.log(`  ${l.club_id.padEnd(12)} ${l.space_id.padEnd(14)} ${l.pris}/2`)

  verifier('\n  trois clubs occupés simultanément sur le même créneau', repartition.length === 3,
    `clubs distincts trouvés : ${repartition.length}`)
  verifier('  Minimes est bien à 2/2', repartition.find((l) => l.club_id === 'minimes')?.pris === 2)

  // Nettoyage.
  await client.query('delete from public.coach_reservations where coach_id = any($1)', [coachs])
  await client.query('delete from public.coach_profiles where id = any($1)', [coachs])
  await client.query('delete from auth.users where id = any($1)', [coachs])
  await client.end()

  console.log(`\n${reussis} vérification(s) passée(s), ${echoues} échec(s)\n`)
  process.exit(echoues === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
