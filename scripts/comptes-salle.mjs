/**
 * Comptes du back-office — création et remise à zéro des mots de passe.
 *
 *   node scripts/comptes-salle.mjs --lister
 *   node scripts/comptes-salle.mjs --activer-tous
 *   node scripts/comptes-salle.mjs --reinitialiser minimes
 *   node scripts/comptes-salle.mjs --desactiver minimes
 *
 * ── POURQUOI UN SCRIPT ET PAS UNE MIGRATION ────────────────────────────────
 *
 * Un mot de passe écrit dans une migration est un mot de passe dans
 * l'historique git, pour toujours, sur la machine de tous ceux qui clonent.
 * C'est déjà arrivé une fois sur ce projet. La migration crée donc les comptes
 * VIDES et désactivés ; ce script leur donne un secret, l'affiche UNE SEULE
 * FOIS, et n'en conserve que l'empreinte.
 *
 * Si le mot de passe est perdu, il ne se retrouve pas : on en refait un. C'est
 * le comportement voulu — un mot de passe qu'on peut relire n'est pas un mot de
 * passe, c'est une note.
 *
 * ── LE FORMAT DES MOTS DE PASSE ────────────────────────────────────────────
 *
 * Ils seront tapés par le personnel des salles, parfois sur un téléphone, au
 * bord d'un ring. L'alphabet exclut donc tout ce qui se confond à l'œil ou à
 * l'oral : ni 0/O, ni 1/l/I, ni 5/S, ni 8/B. Il reste 31 signes, et seize
 * signes donnent environ 79 bits — largement hors de portée d'une attaque par
 * force brute, et dictable au téléphone sans se tromper.
 *
 * ── L'EMPREINTE ────────────────────────────────────────────────────────────
 *
 * scrypt, avec un sel de seize octets par compte. Pas un simple SHA : un
 * condensat rapide se casse au dictionnaire, scrypt est conçu pour coûter cher
 * en mémoire et rendre ce calcul déraisonnable.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Les paramètres scrypt. Ils sont écrits ici pour qu'une relecture les voie. */
export const SCRYPT = { N: 16384, r: 8, p: 1, longueur: 64 }

const ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ2346789'

function motDePasse(taille = 16) {
  const octets = randomBytes(taille * 2)
  let sortie = ''
  for (let i = 0; sortie.length < taille; i++) {
    const v = octets[i % octets.length]
    // Le rejet des valeurs hautes évite le biais du modulo : sans lui, les
    // premières lettres de l'alphabet sortiraient un peu plus souvent.
    if (v >= 256 - (256 % ALPHABET.length)) continue
    sortie += ALPHABET[v % ALPHABET.length]
  }
  return sortie.replace(/(.{4})(?=.)/g, '$1-')
}

export function empreinteDe(motDePasseClair, selHex) {
  return scryptSync(
    motDePasseClair.normalize('NFKC'),
    Buffer.from(selHex, 'hex'),
    SCRYPT.longueur,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
  ).toString('hex')
}

export function empreinteCorrespond(motDePasseClair, selHex, empreinteHex) {
  if (!selHex || !empreinteHex) return false
  const attendue = Buffer.from(empreinteHex, 'hex')
  const obtenue = Buffer.from(empreinteDe(motDePasseClair, selHex), 'hex')
  // Comparaison à temps constant : une comparaison ordinaire s'arrête au
  // premier octet différent et fuite la longueur du préfixe correct.
  return attendue.length === obtenue.length && timingSafeEqual(attendue, obtenue)
}

function lireEnv() {
  const chemin = join(RACINE, '.env.local')
  const texte = readFileSync(chemin, 'utf8')
  return Object.fromEntries(
    texte
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const option = (nom) => args.includes(nom)
  const valeur = (nom) => {
    const i = args.indexOf(nom)
    return i >= 0 ? args[i + 1] : undefined
  }

  const env = lireEnv()
  const url = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL
  if (!url) {
    console.error('REFUS : aucune URL de base dans .env.local.')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    if (option('--lister') || args.length === 0) {
      const { rows } = await client.query(
        `select identifiant, role, club_id, libelle, is_active, derniere_connexion_le
         from public.coach_staff_accounts order by role desc, identifiant`,
      )
      console.log('\nComptes du back-office :\n')
      for (const r of rows) {
        const etat = r.is_active ? 'actif   ' : 'INACTIF '
        const portee = r.club_id ? `club ${r.club_id}` : 'tous les clubs'
        const vu = r.derniere_connexion_le
          ? new Date(r.derniere_connexion_le).toISOString().slice(0, 16).replace('T', ' ')
          : 'jamais connecté'
        console.log(`  ${etat} ${r.identifiant.padEnd(14)} ${portee.padEnd(18)} ${vu}`)
      }
      console.log('\n  --activer-tous              donne un mot de passe à tout compte qui n’en a pas')
      console.log('  --reinitialiser <ident>     en refait un pour ce compte')
      console.log('  --desactiver <ident>        ferme le compte sans le supprimer\n')
      return
    }

    if (option('--desactiver')) {
      const id = valeur('--desactiver')
      const { rowCount } = await client.query(
        `update public.coach_staff_accounts
         set is_active = false, sel = null, empreinte = null
         where identifiant = $1`,
        [id],
      )
      // On efface aussi le secret : un compte fermé dont l'empreinte survit
      // redevient ouvert au premier `is_active = true` distrait.
      console.log(rowCount ? `Compte « ${id} » fermé, secret effacé.` : `Aucun compte « ${id} ».`)
      return
    }

    const cibles = option('--reinitialiser')
      ? [valeur('--reinitialiser')]
      : (
          await client.query(
            `select identifiant from public.coach_staff_accounts
             where empreinte is null or not is_active order by identifiant`,
          )
        ).rows.map((r) => r.identifiant)

    if (cibles.length === 0) {
      console.log('Tous les comptes ont déjà un mot de passe. Utiliser --reinitialiser pour en refaire un.')
      return
    }

    const produits = []
    for (const identifiant of cibles) {
      const clair = motDePasse()
      const sel = randomBytes(16).toString('hex')
      const { rowCount } = await client.query(
        `update public.coach_staff_accounts
         set sel = $2, empreinte = $3, is_active = true
         where identifiant = $1`,
        [identifiant, sel, empreinteDe(clair, sel)],
      )
      if (rowCount) produits.push([identifiant, clair])
      else console.error(`  Aucun compte « ${identifiant} » — ignoré.`)
    }

    console.log('\n  ╭────────────────────────────────────────────────────────────╮')
    console.log('  │  À NOTER MAINTENANT. Ces mots de passe ne seront plus      │')
    console.log('  │  affichés : seule leur empreinte est conservée.            │')
    console.log('  ╰────────────────────────────────────────────────────────────╯\n')
    for (const [id, clair] of produits) {
      console.log(`    ${id.padEnd(16)} ${clair}`)
    }
    console.log('\n  Connexion : /admin/connexion\n')
  } finally {
    await client.end()
  }
}

/**
 * Ne s'exécute QUE lancé directement.
 *
 * Sans ce garde-fou, un simple `import { empreinteDe }` depuis un autre fichier
 * déclenchait `main()` — et donc regénérait les mots de passe de tous les
 * comptes, en silence. C'est arrivé : un script de test a importé la fonction
 * de hachage et a réinitialisé les six comptes au passage.
 *
 * Un module qui agit en étant simplement importé est un piège. Celui-ci
 * n'agira plus que si on le lance.
 */
const lanceDirectement =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (lanceDirectement) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
