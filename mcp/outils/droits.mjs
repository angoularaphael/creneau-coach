/**
 * Famille DROITS ET PERIMETRE — qui a le droit de voir quoi, et qui ecrit quoi.
 *
 * `qui_fait_quoi` est l'outil anti-collision du projet : trois lots, trois
 * developpeurs, un seul depot. Deux lots qui ecrivent le meme endpoint, c'est la
 * panne d'integration la plus chere possible.
 */

import { z } from 'zod'

import * as cahier from '../lib/cahier.mjs'
import * as env from '../lib/env.mjs'
import * as repartition from '../lib/repartition.mjs'
import { lire } from '../lib/sources.mjs'
import { section, tableaux } from '../lib/markdown.mjs'
import { ANNOTATIONS, absent, invalide, normaliser, tableauTexte, texte } from './commun.mjs'

// ---------------------------------------------------------------------------
// 16 — matrice_rls
// ---------------------------------------------------------------------------

const matriceRls = {
  nom: 'matrice_rls',
  config: {
    title: 'Matrice RLS du contrat',
    description:
      'Les droits SELECT / INSERT / UPDATE par role et par table, plus les vues recommandees et les ' +
      'colonnes qui doivent en etre exclues. Source : §12 de docs/CAHIER-API.md. La RLS Postgres ' +
      'est EN PLUS des controles API, jamais a la place.',
    inputSchema: {
      table: z.string().optional().describe('Nom de table, ex. coach_reservations'),
      role: z.string().optional().describe('coach | manager_salle | direction | service'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ table, role }) {
    const m = cahier.matriceRls()
    if (!m.tables.length) {
      return absent(`la matrice RLS (§12) est introuvable dans ${cahier.FICHIER}.`, [])
    }

    if (role && !m.roles.includes(role)) {
      return absent(`le role "${role}" n'est pas une colonne de la matrice §12.`, m.roles)
    }

    let lignes = m.tables
    if (table) {
      const cible = String(table).trim()
      lignes = m.tables.filter((t) => t.table === cible)
      if (!lignes.length) {
        return absent(
          `la table "${cible}" n'a pas de ligne dans la matrice §12.`,
          m.tables.map((t) => t.table),
          {
            detail:
              'Une table absente de la matrice n\'est pas une table sans RLS : c\'est une table dont la ' +
              'politique n\'est pas encore ecrite. Ne pas la laisser ouverte : poser la question a Eddy.',
          },
        )
      }
    }

    const colonnes = role
      ? [
          { titre: 'TABLE', cle: 'table' },
          { titre: role.toUpperCase(), cle: (l) => l.droits[role] },
          { titre: 'LIGNE', cle: 'ligne' },
        ]
      : [
          { titre: 'TABLE', cle: 'table' },
          ...m.roles.map((r) => ({ titre: r, cle: (l) => l.droits[r] })),
          { titre: 'LIGNE', cle: 'ligne' },
        ]

    return texte(
      tableauTexte(lignes, colonnes) +
        '\n\nVues :\n' +
        m.vues.map((v) => `  · ${v.texte}  (ligne ${v.ligne})`).join('\n') +
        '\n\n« — » signifie AUCUN droit pour ce role sur cette table, pas « non precise ».',
      [`${cahier.FICHIER} §12`],
    )
  },
}

// ---------------------------------------------------------------------------
// 17 — proprietaire_env
// ---------------------------------------------------------------------------

const proprietaireEnv = {
  nom: 'proprietaire_env',
  config: {
    title: 'Qui remplit quelle variable d\'environnement',
    description:
      'Pour une variable de .env.example : qui la remplit, dans quel lot, ou elle vit (Vercel, ' +
      'BotHosting, local), si elle est secrete et si elle est interdite au navigateur. ' +
      'CET OUTIL NE RENVOIE JAMAIS DE VALEUR : l\'analyseur coupe a la premiere « = » et jette la ' +
      'partie droite. Le nom est connu, la valeur ne l\'est pas et ne peut pas l\'etre.',
    inputSchema: {
      variable: z.string().optional().describe('Nom exact, ex. QR_HMAC_SECRET. Omis : toutes les variables.'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ variable }) {
    const toutes = env.variables()
    if (!toutes.length) {
      return absent('aucune variable trouvee dans .env.example.', [])
    }

    if (variable) {
      const v = env.variable(variable)
      if (!v) {
        return absent(
          `la variable "${variable}" n'est pas declaree dans .env.example.`,
          toutes.map((x) => x.nom),
          {
            detail:
              'Une variable absente du modele ne doit pas etre inventee : l\'ajouter au modele avec une ' +
              'valeur VIDE dans la meme PR que le code qui la lit.',
          },
        )
      }
      const p = env.proprietaire(v.nom)
      return texte(
        [
          `nom                  : ${v.nom}`,
          `lot                  : ${p.lot || '(non attribue par §6 de REPARTITION-TACHES.md)'}`,
          `qui remplit          : ${p.qui || `(deduit de la section : ${v.proprietaires.join(', ') || 'inconnu'})`}`,
          `emplacement          : ${env.emplacement(v)}`,
          `secret               : ${v.secret ? 'OUI' : 'non'}`,
          `interdit navigateur  : ${v.interdit_navigateur ? 'OUI (pas de prefixe NEXT_PUBLIC_)' : 'non (NEXT_PUBLIC_, donc publique par construction)'}`,
          `section du modele    : ${v.section}`,
          `commentee dans .env.example : ${v.commentee ? 'oui (optionnelle ou interdite ici)' : 'non'}`,
          '',
          'VALEUR : non disponible, par conception (G1). Ce serveur ne lit jamais .env, .env.local, ' +
            '.env.production ni bot/.env, et ne lit de .env.example que la partie GAUCHE de chaque ligne.',
        ].join('\n'),
        [`.env.example ligne ${v.ligne}`, p.source].filter(Boolean),
      )
    }

    return texte(
      tableauTexte(
        toutes.map((v) => ({
          ...v,
          lot: env.proprietaire(v.nom).lot || '—',
          qui: env.proprietaire(v.nom).qui || v.proprietaires.join('/') || '—',
          ou: env.emplacement(v),
        })),
        [
          { titre: 'VARIABLE', cle: 'nom' },
          { titre: 'LOT', cle: 'lot' },
          { titre: 'QUI', cle: 'qui' },
          { titre: 'OU', cle: 'ou' },
          { titre: 'SECRET', cle: (v) => (v.secret ? 'oui' : '') },
          { titre: 'LIGNE', cle: 'ligne' },
        ],
      ) + `\n\n${toutes.length} variables. Aucune valeur n'est lue ni renvoyee (G1).`,
      ['.env.example (noms seuls)', 'docs/REPARTITION-TACHES.md §6'],
    )
  },
}

// ---------------------------------------------------------------------------
// 18 — qui_fait_quoi
// ---------------------------------------------------------------------------

const quiFaitQuoi = {
  nom: 'qui_fait_quoi',
  config: {
    title: 'Qui est responsable de ce sujet',
    description:
      "L'outil anti-collision. Pour un sujet (« webhook Payplug », « hold », « QR », « RLS »), " +
      'renvoie le lot, le responsable, les lignes de checklist concernees et ce que ca bloque. ' +
      "A appeler AVANT d'ecrire du code : modifier le lot d'un autre developpeur est la faute la " +
      'plus grave de ce projet.',
    inputSchema: { sujet: z.string().describe('Ex. webhook payplug, hold, signature, RLS, back-office, QR') },
    annotations: ANNOTATIONS,
  },
  async handler({ sujet }) {
    const q = String(sujet || '').trim()
    if (!q) return invalide('`sujet` est vide.')

    const trouvees = repartition.chercher(q)
    const lots = repartition.lots()

    if (!trouvees.length) {
      return absent(
        `aucune tache de docs/REPARTITION-TACHES.md ne parle de "${q}".`,
        [],
        {
          detail:
            'Les lots declares :\n' +
            lots.map((l) => `  · Lot ${l.lot} — ${l.responsable} : ${l.perimetre}`).join('\n') +
            '\n\nUn sujet absent de la repartition n\'appartient a personne : c\'est une question pour ' +
            'Eddy avant d\'etre du code. Verifier aussi la liste « Hors lot » : ' +
            repartition.horsLot().map((h) => `${h.texte} (ligne ${h.ligne})`).join(' · '),
        },
      )
    }

    const parLot = new Map()
    for (const t of trouvees) {
      const cle = t.lot || '?'
      if (!parLot.has(cle)) parLot.set(cle, [])
      parLot.get(cle).push(t)
    }

    const blocs = [...parLot.entries()].map(([lot, taches]) => {
      const info = lots.find((l) => l.lot === lot)
      return (
        `LOT ${lot}${info ? ` — ${info.responsable}` : ''}${info ? `\n  perimetre : ${info.perimetre}` : ''}\n` +
        taches
          .slice(0, 12)
          .map((t) => `  [${t.etat}] ${t.texte}\n        (${t.sous_section || t.section}, ligne ${t.ligne})`)
          .join('\n')
      )
    })

    const lotsTouches = [...parLot.keys()].filter((l) => l !== '?')
    const blocages = repartition
      .blocages()
      .filter((b) => lotsTouches.some((l) => {
        const info = lots.find((x) => x.lot === l)
        return info && normaliser(`${b.quoi} ${b.detail}`).includes(normaliser(info.responsable))
      }))

    return texte(
      [
        blocs.join('\n\n'),
        '',
        lotsTouches.length > 1
          ? `ATTENTION : ce sujet touche ${lotsTouches.length} lots (${lotsTouches.join(', ')}). ` +
            `C'est une couture entre developpeurs : se mettre d'accord AVANT d'ecrire, pas apres.`
          : `Ce sujet appartient au lot ${lotsTouches[0] || '?'}. Si ce n'est pas le votre : ne pas y toucher, ` +
            `ouvrir la question avec son responsable (cahier §14 : PR relue par le responsable du lot).`,
        blocages.length ? `\nDependances declarees :\n${blocages.map((b) => `  · ${b.quoi} : ${b.detail} (ligne ${b.ligne})`).join('\n')}` : '',
      ].join('\n'),
      ['docs/REPARTITION-TACHES.md'],
    )
  },
}

// ---------------------------------------------------------------------------
// 19 — tests_contractuels
// ---------------------------------------------------------------------------

const testsContractuels = {
  nom: 'tests_contractuels',
  config: {
    title: 'Tests de securite a faire passer',
    description:
      'Les tests contractuels du §13 du cahier et les checklists « Secu / tests » de ' +
      'docs/REPARTITION-TACHES.md, avec l\'assertion attendue. Ce sont les tests qui doivent passer ' +
      'AVANT la mise en ligne, pas une suggestion.',
    inputSchema: {
      code: z.string().optional().describe("Filtrer sur un code d'erreur, ex. SLOT_FULL"),
      lot: z.string().optional().describe('Filtrer sur un lot : A, B ou C'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ code, lot }) {
    const tous = cahier.testsContractuels()
    if (!tous.length) {
      return absent(`la liste des tests contractuels (§13) est introuvable dans ${cahier.FICHIER}.`, [])
    }

    let cahierTests = tous
    if (code) {
      const cible = String(code).trim().toUpperCase()
      const connus = cahier.codesErreur().map((c) => c.code)
      if (!connus.includes(cible)) {
        return absent(`"${cible}" n'est pas un code d'erreur du contrat (§1.3).`, connus)
      }
      cahierTests = tous.filter((t) => t.codes.includes(cible))
    }

    const checklists = repartition
      .taches()
      .filter((t) => /secu|test/i.test(`${t.sous_section}`))
      .filter((t) => (lot ? t.lot === String(lot).toUpperCase() : true))
      .filter((t) => (code ? normaliser(t.texte).includes(normaliser(code)) : true))

    if (!cahierTests.length && !checklists.length) {
      return absent(
        `aucun test ne correspond a ${JSON.stringify({ code, lot })}.`,
        [],
        {
          detail:
            `Le cahier §13 en declare ${tous.length} au total. ` +
            `Un code d'erreur sans test contractuel est un trou de couverture : le signaler a Eddy.`,
        },
      )
    }

    const corps = [
      cahierTests.length
        ? `docs/CAHIER-API.md §13 — ${cahierTests.length} test(s) :\n` +
          cahierTests
            .map(
              (t) =>
                `  #${t.numero} ${t.enonce}\n` +
                `       assertion : statut ${t.http_cites.join(' / ') || '(non chiffre)'}` +
                `${t.codes.length ? `, code ${t.codes.join(' / ')}` : ''}  (ligne ${t.ligne})`,
            )
            .join('\n')
        : null,
      checklists.length
        ? `\ndocs/REPARTITION-TACHES.md — checklists secu :\n` +
          checklists
            .map((t) => `  [${t.etat}] lot ${t.lot || '?'} · ${t.texte}  (${t.sous_section}, ligne ${t.ligne})`)
            .join('\n')
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    return texte(corps, [`${cahier.FICHIER} §13`, 'docs/REPARTITION-TACHES.md §1.5 / §2.4 / §3.3'])
  },
}

// ---------------------------------------------------------------------------
// 20 — seo_route
// ---------------------------------------------------------------------------

const seoRoute = {
  nom: 'seo_route',
  config: {
    title: 'Arbitre des routes publiques (SEO)',
    description:
      'La route canonique pour une intention, ou le statut d\'une URL : indexable ou noindex, ' +
      'contenu unique attendu, regles de metadonnees et donnees structurees autorisees. ' +
      'Source : docs/SEO-INFORMATION-ARCHITECTURE.md. Sert a ce que l\'IA qui fait l\'UI ne puisse ' +
      'pas inventer une URL : l\'arbitre est interrogeable.',
    inputSchema: {
      intention: z.string().optional().describe('Ex. « tarifs », « fiche club Portet », « annulation »'),
      url: z.string().optional().describe('Ex. /clubs/portet-sur-garonne/ ou /app/reserver/'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ intention, url }) {
    const src = lire('seo')
    const routes = routesPubliques(src.texte)
    const privees = routesPrivees(src.texte)

    if (!routes.length) {
      return absent(`la carte de routes (§3) est introuvable dans ${src.chemin}.`, [])
    }
    if (!intention && !url) {
      return texte(
        `Carte des routes publiques canoniques (§3) :\n\n` +
          tableauTexte(routes, [
            { titre: 'ROUTE', cle: 'route' },
            { titre: 'INTENTION', cle: 'intention' },
            { titre: 'CONTENU UNIQUE ATTENDU', cle: 'contenu' },
          ]) +
          `\n\nRoutes privees (§4), TOUJOURS noindex, jamais au sitemap :\n  ${privees.join('\n  ')}` +
          `\n\n${reglesTexte(src.texte)}`,
        [`${src.chemin} §3, §4, §5, §6, §7, §8`],
      )
    }

    if (url) {
      const u = String(url).trim()
      const pub = routes.find((r) => normaliserRoute(r.route) === normaliserRoute(u))
      if (pub) {
        return texte(
          [
            `URL           : ${pub.route}`,
            `indexation    : INDEXABLE (route publique canonique, §3 ligne ${pub.ligne})`,
            `intention     : ${pub.intention}`,
            `contenu exige : ${pub.contenu}`,
            '',
            reglesTexte(src.texte),
          ].join('\n'),
          [`${src.chemin} §3 ligne ${pub.ligne}`, `${src.chemin} §5, §6, §7`],
        )
      }
      const priv = privees.find((p) => normaliserRoute(p) === normaliserRoute(u))
      const prefixePrive = /^\/(app|admin|api)\//.test(u)
      if (priv || prefixePrive) {
        return texte(
          [
            `URL        : ${u}`,
            `indexation : NOINDEX, NOFOLLOW — route privee (§4).`,
            'Elle ne figure jamais au sitemap, et robots.txt ne remplace pas l\'authentification (§8).',
            'Rappel §14 : aucun statut de reservation, e-mail, coach, QR ou paiement ne doit apparaitre ' +
              'dans du HTML public.',
          ].join('\n'),
          [`${src.chemin} §4, §8, §14`],
        )
      }
      return absent(
        `l'URL "${u}" ne figure ni dans la carte publique §3 ni dans les routes privees §4 de ${src.chemin}.`,
        routes.map((r) => r.route),
        {
          detail:
            'Ne pas creer une route qui n\'est pas a la carte : §3 dit explicitement de ne pas creer de ' +
            'pages synonymes minces. Ajouter la route a la carte dans une PR, puis la coder.',
        },
      )
    }

    const q = normaliser(intention)
    const mots = q.split(/\s+/).filter((m) => m.length > 2)
    const scorees = routes
      .map((r) => {
        const foin = normaliser(`${r.route} ${r.intention} ${r.contenu}`)
        return { ...r, score: (mots.length ? mots : [q]).reduce((n, m) => n + (foin.includes(m) ? 1 : 0), 0) }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)

    if (!scorees.length) {
      return absent(
        `aucune route de la carte §3 ne correspond a l'intention "${intention}".`,
        routes.map((r) => r.route),
        { detail: 'Une intention sans route canonique est une decision a prendre, pas une URL a inventer.' },
      )
    }

    return texte(
      `Route canonique pour « ${intention} » :\n\n` +
        tableauTexte(scorees.slice(0, 5), [
          { titre: 'ROUTE', cle: 'route' },
          { titre: 'INTENTION', cle: 'intention' },
          { titre: 'CONTENU UNIQUE ATTENDU', cle: 'contenu' },
          { titre: 'LIGNE', cle: 'ligne' },
        ]) +
        `\n\n${reglesTexte(src.texte)}`,
      [`${src.chemin} §3`, `${src.chemin} §5, §6, §7`],
    )
  },
}

function normaliserRoute(r) {
  return String(r || '').trim().replace(/\/+$/, '') || '/'
}

function routesPubliques(t) {
  const s = section(t, '3')
  if (!s) return []
  const tabs = tableaux(s.corps, s.ligne + 1)
  if (!tabs.length) return []
  return tabs[0].lignes
    .map((c, i) => ({
      route: (c[0] || '').replace(/`/g, '').trim(),
      intention: c[1] || '',
      contenu: c[2] || '',
      ligne: tabs[0].ligne_debut + 2 + i,
    }))
    .filter((r) => r.route.startsWith('/'))
}

function routesPrivees(t) {
  const s = section(t, '4')
  if (!s) return []
  const bloc = /```(?:text)?\s*([\s\S]*?)```/.exec(s.corps)
  if (!bloc) return []
  return bloc[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('/'))
}

function reglesTexte(t) {
  const meta = section(t, '7')
  const struct = section(t, '6')
  const canon = section(t, '5')
  return [
    'Metadonnees exigees par route publique (§7) :',
    meta ? meta.corps.trim() : '(section 7 introuvable)',
    '',
    'Donnees structurees autorisees (§6) :',
    struct ? struct.corps.trim() : '(section 6 introuvable)',
    '',
    'Destination canonique (§5) :',
    canon ? canon.corps.trim() : '(section 5 introuvable)',
  ].join('\n')
}

export const OUTILS = [matriceRls, proprietaireEnv, quiFaitQuoi, testsContractuels, seoRoute]
