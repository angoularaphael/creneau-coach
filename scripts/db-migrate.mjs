#!/usr/bin/env node
/**
 * Applique les migrations SQL, dans l'ordre, une seule fois chacune.
 *
 *   node scripts/db-migrate.mjs                 → base de développement
 *   node scripts/db-migrate.mjs --test          → base de test
 *   node scripts/db-migrate.mjs --reset         → repart de zéro (dev/test uniquement)
 *   node scripts/db-migrate.mjs --url <dsn>     → base explicite (Supabase, préproduction)
 *   node scripts/db-migrate.mjs --dry           → liste sans appliquer
 *
 * Deux garde-fous :
 *   1. `--reset` refuse de s'exécuter sur une URL qui n'est pas locale, sauf
 *      `--i-know-what-i-am-doing`. Effacer la base d'un collègue est l'accident
 *      que ce script ne doit jamais rendre facile.
 *   2. Chaque migration tourne dans SA transaction. Une migration qui échoue est
 *      annulée entièrement et n'est pas enregistrée : on ne laisse jamais la base
 *      dans un état à moitié migré.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOSSIER_MIGRATIONS = join(RACINE, 'supabase', 'migrations')

const args = process.argv.slice(2)
const aOption = (nom) => args.includes(nom)
const valeurOption = (nom) => {
  const i = args.indexOf(nom)
  return i !== -1 ? args[i + 1] : undefined
}

function chargerEnv() {
  for (const nom of ['.env.local', '.env']) {
    const chemin = join(RACINE, nom)
    if (!existsSync(chemin)) continue
    for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(ligne.trim())
      if (!m) continue
      const [, cle, brut] = m
      if (process.env[cle] !== undefined) continue
      process.env[cle] = brut.replace(/^["'](.*)["']$/, '$1')
    }
  }
}
chargerEnv()

function urlCible() {
  const explicite = valeurOption('--url')
  if (explicite) return explicite
  if (aOption('--test')) {
    return process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:5432/creneau_coach_test'
  }
  return process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/creneau_coach_dev'
}

const estLocale = (url) => /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)

function migrationsDisponibles() {
  if (!existsSync(DOSSIER_MIGRATIONS)) return []
  return readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((nom) => {
      const sql = readFileSync(join(DOSSIER_MIGRATIONS, nom), 'utf8')
      return { nom, sql, empreinte: createHash('sha256').update(sql).digest('hex').slice(0, 16) }
    })
}

async function main() {
  const url = urlCible()
  const masquee = url.replace(/:\/\/([^:@/]+)(:[^@]*)?@/, '://$1:***@')

  if (aOption('--reset') && !estLocale(url) && !aOption('--i-know-what-i-am-doing')) {
    console.error(`REFUS : --reset sur une base distante (${masquee}).`)
    console.error("Ajoute --i-know-what-i-am-doing si c'est vraiment ce que tu veux.")
    process.exit(2)
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: estLocale(url) ? undefined : { rejectUnauthorized: false },
  })
  await client.connect()
  console.log(`base      : ${masquee}`)

  if (aOption('--reset')) {
    console.log('reset     : drop schema public cascade')
    await client.query('drop schema if exists public cascade; create schema public;')
    await client.query('drop schema if exists coach_interne cascade;')
  }

  await client.query(`
    create table if not exists coach_migrations (
      nom         text        primary key,
      empreinte   text        not null,
      applique_le timestamptz not null default now()
    )
  `)

  const deja = new Map(
    (await client.query('select nom, empreinte from coach_migrations')).rows.map((r) => [r.nom, r.empreinte]),
  )
  const toutes = migrationsDisponibles()
  if (toutes.length === 0) {
    console.log('aucune migration dans supabase/migrations/')
    await client.end()
    return
  }

  let appliquees = 0
  for (const { nom, sql, empreinte } of toutes) {
    const connue = deja.get(nom)
    if (connue) {
      if (connue !== empreinte) {
        console.error(`\nSTOP : ${nom} a été modifiée après avoir été appliquée.`)
        console.error(`       enregistrée ${connue}, sur disque ${empreinte}`)
        console.error('       Une migration appliquée est immuable. Écris-en une nouvelle.')
        await client.end()
        process.exit(3)
      }
      continue
    }

    if (aOption('--dry')) {
      console.log(`  [à appliquer] ${nom}`)
      continue
    }

    process.stdout.write(`  ${nom} … `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into coach_migrations (nom, empreinte) values ($1, $2)', [nom, empreinte])
      await client.query('commit')
      console.log('ok')
      appliquees++
    } catch (e) {
      await client.query('rollback')
      console.log('ÉCHEC')
      console.error(`\n${e.message}`)
      if (e.position) {
        const avant = sql.slice(0, Number(e.position))
        console.error(`ligne ${avant.split('\n').length} de ${nom}`)
      }
      await client.end()
      process.exit(1)
    }
  }

  console.log(
    aOption('--dry')
      ? 'simulation terminée'
      : `${appliquees} migration(s) appliquée(s), ${toutes.length - appliquees - 0} déjà en place`,
  )
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
