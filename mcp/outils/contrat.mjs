/**
 * Famille CONTRAT — lire l'API telle qu'elle est ecrite.
 *
 * Tout vient de docs/openapi.yaml et docs/CAHIER-API.md, relus a chaque appel.
 * Aucun outil de cette famille ne prend un chemin de fichier en parametre.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'
import ajvFormats from 'ajv-formats'
import { z } from 'zod'

import * as cahier from '../lib/cahier.mjs'
import * as oas from '../lib/openapi.mjs'
import { CLES, FICHIERS, RACINE, etatDesFichiers, lire } from '../lib/sources.mjs'
import { ANNOTATIONS, absent, invalide, json, normaliser, structure, tableauTexte, texte } from './commun.mjs'

const execFileP = promisify(execFile)

/** Les documents ouverts a la recherche plein texte. `.env.example` en est EXCLU
 *  volontairement : ses lignes portent des valeurs, et un extrait brut les ferait
 *  sortir. Pour l'environnement, il y a `proprietaire_env`, qui coupe a la « = ». */
const DOCS_RECHERCHABLES = CLES.filter((c) => c !== 'env_exemple')

// ---------------------------------------------------------------------------

function lotDUnEndpoint(chemin, methode) {
  const e = cahier.endpoint(methode, chemin)
  if (!e || !e.section) return { lot: null, responsable: null, section: null, cahier: null }
  const l = cahier.lotDUneSection(e.section)
  return {
    lot: l ? l.lot : null,
    responsable: l ? l.responsable : null,
    section: e.section,
    titre_section: l ? l.titre_section : null,
    cahier: `${cahier.FICHIER} §${e.section}, ligne ${e.ligne}`,
    corps: e.corps,
  }
}

function limitePour(chemin, methode) {
  const cible = `${methode} ${chemin}`
  for (const l of cahier.limitesDeDebit()) {
    const motif = l.route.replace(/\.\.\./g, '').trim()
    if (!motif) continue
    const morceaux = motif.split(/\s+/)
    const dernier = morceaux[morceaux.length - 1]
    if (dernier.startsWith('/') && cible.includes(dernier)) return l
    if (motif.startsWith(methode) && cible.includes(morceaux[1] || '///aucun-terme///')) return l
  }
  return null
}

// ---------------------------------------------------------------------------
// 1 — contrat_lister_endpoints
// ---------------------------------------------------------------------------

const listerEndpoints = {
  nom: 'contrat_lister_endpoints',
  config: {
    title: 'Lister les endpoints du contrat',
    description:
      "Liste les operations declarees dans docs/openapi.yaml, avec le lot responsable lu dans " +
      "docs/CAHIER-API.md. A appeler AVANT contrat_endpoint : sans liste, on devine un chemin, " +
      "on recoit ABSENT, et on en conclut a tort que l'endpoint n'existe pas.",
    inputSchema: {
      tag: z.string().optional().describe('Filtre par tag OpenAPI : public, me, reservations, payments, signatures, qr, admin, internal'),
      lot: z.string().optional().describe('Filtre par lot : A (Raphael), B (Brad), C (Junior)'),
      prefixe: z.string().optional().describe('Filtre par debut de chemin, ex. /admin'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ tag, lot, prefixe }) {
    let ops = oas.operations()
    const tagsConnus = oas.tags()

    if (tag) {
      if (!tagsConnus.includes(tag)) {
        return absent(`le tag "${tag}" n'est pas declare dans docs/openapi.yaml.`, tagsConnus)
      }
      ops = ops.filter((o) => o.tags.includes(tag))
    }
    if (prefixe) ops = ops.filter((o) => o.chemin.startsWith(prefixe))

    const enrichies = ops.map((o) => ({ ...o, ...lotDUnEndpoint(o.chemin, o.methode) }))
    const filtrees = lot
      ? enrichies.filter((o) => o.lot === String(lot).toUpperCase())
      : enrichies

    if (!filtrees.length) {
      return absent(
        `aucune operation ne correspond a ${JSON.stringify({ tag, lot, prefixe })} dans docs/openapi.yaml.`,
        [],
        { detail: `Le contrat declare ${ops.length} operation(s) avant ce filtre.` },
      )
    }

    const corps = tableauTexte(filtrees, [
      { titre: 'METHODE', cle: 'methode' },
      { titre: 'CHEMIN', cle: 'chemin' },
      { titre: 'operationId', cle: 'operationId' },
      { titre: 'LOT', cle: 'lot' },
      { titre: 'QUI', cle: 'responsable' },
      { titre: 'TAGS', cle: (l) => l.tags.join(',') },
      { titre: 'RESUME', cle: 'summary' },
    ])

    return texte(
      `${filtrees.length} operation(s) sur ${oas.operations().length} declarees.\n\n${corps}\n\n` +
        `Le LOT vient du titre de la section du cahier qui documente l'endpoint ` +
        `(« 6. Reservations — Junior » → lot C). Un « — » signifie que le cahier ne documente pas ` +
        `cet endpoint : c'est un ecart entre openapi.yaml et CAHIER-API.md, a signaler.`,
      [`docs/openapi.yaml (${oas.operations().length} operations)`, `${cahier.FICHIER} §4 a §10 (attribution des lots)`],
    )
  },
}

// ---------------------------------------------------------------------------
// 2 — contrat_endpoint
// ---------------------------------------------------------------------------

const endpoint = {
  nom: 'contrat_endpoint',
  config: {
    title: "Dossier complet d'un endpoint",
    description:
      "L'operation dereferencee : parametres (dont Idempotency-Key), corps de requete, reponses " +
      "par statut, codes d'erreur cites par le cahier, lot responsable, limite de debit §1.5, " +
      "et le texte du cahier qui decrit les regles metier. Repond ABSENT si le chemin n'existe pas.",
    inputSchema: {
      path: z.string().describe('Chemin exact du contrat, ex. /reservations ou /reservations/{id}/cancel'),
      method: z.string().optional().describe('GET, POST, PATCH, DELETE. Optionnel si le chemin n\'a qu\'une operation.'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ path, method }) {
    const chemin = String(path || '').trim()
    const op = oas.operation(chemin, method)

    if (!op) {
      const proches = oas
        .chemins()
        .filter((c) => normaliser(c).includes(normaliser(chemin).replace(/^\//, '').split('/')[0] || '///aucun-terme///'))
      return absent(
        `aucune operation ${method ? `${String(method).toUpperCase()} ` : ''}"${chemin}" dans docs/openapi.yaml.`,
        [],
        {
          detail:
            (proches.length ? `Chemins voisins : ${proches.join(', ')}.\n` : '') +
            'Appeler contrat_lister_endpoints pour la liste complete plutot que de deviner un autre chemin.',
        },
      )
    }
    if (op.ambigu) {
      return invalide(
        `le chemin "${chemin}" porte ${op.ambigu.length} operations (${op.ambigu.map((o) => o.methode).join(', ')}). Preciser le parametre method.`,
      )
    }

    const complet = oas.deref(op.brut)
    const params = [...(op.parametres_du_chemin || []), ...(op.brut.parameters || [])].map((p) =>
      oas.deref(p),
    )
    const idem = params.find((p) => String(p.name).toLowerCase() === 'idempotency-key')
    const meta = lotDUnEndpoint(op.chemin, op.methode)
    const limite = limitePour(op.chemin, op.methode)
    const statuts = Object.keys(complet.responses || {})
    const codes = meta.corps ? cahier.codesCites(meta.corps) : []

    const morceaux = [
      `${op.methode} ${op.chemin}`,
      `operationId : ${op.operationId || '(absent)'}`,
      `resume      : ${op.summary || '(absent)'}`,
      `tags        : ${op.tags.join(', ') || '(aucun)'}`,
      `LOT         : ${meta.lot || 'non attribue par le cahier'}${meta.responsable ? ` — ${meta.responsable}` : ''}`,
      meta.titre_section ? `section     : ${meta.titre_section}` : null,
      '',
      `Idempotency-Key : ${idem ? (idem.required ? 'OBLIGATOIRE' : 'optionnel') : 'non declare sur cette operation'}`,
      `Securite        : ${JSON.stringify(complet.security ?? '(herite du document : cookieAuth)')}`,
      `Limite de debit : ${limite ? `${limite.limite}  (${cahier.FICHIER} §1.5, ligne ${limite.ligne})` : 'aucune ligne §1.5 ne vise cet endpoint'}`,
      `Statuts declares: ${statuts.join(', ') || '(aucun)'}`,
      `Codes d'erreur cites par le cahier dans cette section : ${codes.length ? codes.join(', ') : '(aucun cite nommement)'}`,
      '',
      '--- Parametres (dereferences) ---',
      json(params.length ? params : '(aucun)'),
      '',
      '--- Corps de requete (dereference) ---',
      json(complet.requestBody || '(aucun)'),
      '',
      '--- Reponses (dereferencees) ---',
      json(complet.responses || '(aucune)'),
    ]

    if (meta.corps) {
      morceaux.push('', '--- Regles metier, texte du cahier ---', meta.corps.trim())
    } else {
      morceaux.push(
        '',
        `ATTENTION : aucune section de ${cahier.FICHIER} ne documente ${op.methode} ${op.chemin}. ` +
          `openapi.yaml et le cahier divergent — le cahier §14 exige qu'ils evoluent ENSEMBLE. A signaler.`,
      )
    }

    return texte(
      morceaux.filter((m) => m !== null).join('\n'),
      [
        `docs/openapi.yaml, ligne ${oas.ligneDuChemin(op.chemin) || '?'}`,
        meta.cahier,
        limite ? `${cahier.FICHIER} §1.5 ligne ${limite.ligne}` : null,
      ],
    )
  },
}

// ---------------------------------------------------------------------------
// 3 — contrat_lister_schemas
// ---------------------------------------------------------------------------

const listerSchemas = {
  nom: 'contrat_lister_schemas',
  config: {
    title: 'Lister les schemas du contrat',
    description:
      'Les noms des schemas de components.schemas dans docs/openapi.yaml. A appeler avant ' +
      'contrat_schema pour ne pas se tromper de nom.',
    inputSchema: { q: z.string().optional().describe('Filtre : sous-chaine du nom, insensible a la casse') },
    annotations: ANNOTATIONS,
  },
  async handler({ q }) {
    const tous = oas.nomsSchemas()
    const liste = q ? tous.filter((n) => normaliser(n).includes(normaliser(q))) : tous
    if (!liste.length) {
      return absent(`aucun schema ne contient "${q}" dans docs/openapi.yaml.`, tous)
    }
    const avecEnum = liste.map((n) => {
      const e = oas.enumeration(n)
      return { nom: n, ligne: oas.ligneDuSchema(n), valeurs: e ? e.join(' | ') : '' }
    })
    return texte(
      `${liste.length} schema(s) sur ${tous.length}.\n\n` +
        tableauTexte(avecEnum, [
          { titre: 'SCHEMA', cle: 'nom' },
          { titre: 'LIGNE', cle: 'ligne' },
          { titre: 'ENUM (valeurs litterales)', cle: 'valeurs' },
        ]),
      ['docs/openapi.yaml, components.schemas'],
    )
  },
}

// ---------------------------------------------------------------------------
// 4 — contrat_schema
// ---------------------------------------------------------------------------

const schema = {
  nom: 'contrat_schema',
  config: {
    title: 'Un schema du contrat',
    description:
      'Le schema exact, $ref resolus par defaut : champs requis, enumerations litterales, ' +
      'valeurs par defaut. Repond ABSENT avec la liste des noms valides si le nom n\'existe pas.',
    inputSchema: {
      nom: z.string().describe('Nom exact, ex. Reservation, Slot, ErrorCode'),
      deref: z.boolean().optional().describe('Resoudre les $ref (defaut : true)'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ nom, deref = true }) {
    const s = oas.schema(nom, deref)
    if (s === null) {
      return absent(`le schema "${nom}" n'existe pas dans docs/openapi.yaml.`, oas.nomsSchemas())
    }
    const ligne = oas.ligneDuSchema(nom)
    const requis = Array.isArray(s.required) ? s.required : []
    return texte(
      `Schema ${nom}${deref ? ' (dereference)' : ' (brut, $ref non resolus)'}\n` +
        `Champs requis : ${requis.length ? requis.join(', ') : '(aucun)'}\n\n${json(s)}`,
      [`docs/openapi.yaml, ligne ${ligne || '?'}`],
    )
  },
}

// ---------------------------------------------------------------------------
// 5 — contrat_code_erreur
// ---------------------------------------------------------------------------

const codeErreur = {
  nom: 'contrat_code_erreur',
  config: {
    title: "Code d'erreur du contrat",
    description:
      "Le statut HTTP, le sens, et les tests §13 qui couvrent un code d'erreur. " +
      "Source : enum ErrorCode de docs/openapi.yaml + tableau §1.3 de docs/CAHIER-API.md. " +
      "Repond ABSENT avec les 18 codes valides si le code n'existe pas. " +
      "Piege classique : une resa d'un autre coach rend 404 NOT_FOUND, jamais 403.",
    inputSchema: { code: z.string().describe('Ex. SLOT_FULL, HOLD_EXPIRED, QR_WRONG_CLUB') },
    annotations: ANNOTATIONS,
  },
  async handler({ code }) {
    const demande = String(code || '').trim().toUpperCase()
    const enumOas = oas.enumeration('ErrorCode') || []
    const table = cahier.codesErreur()
    const ligne = table.find((c) => c.code === demande)
    const dansEnum = enumOas.includes(demande)

    if (!ligne && !dansEnum) {
      return absent(
        `"${demande}" ne figure ni dans l'enum ErrorCode de docs/openapi.yaml ni dans le tableau §1.3 du cahier.`,
        enumOas,
      )
    }

    const ecarts = []
    if (!dansEnum) ecarts.push(`"${demande}" est dans le cahier §1.3 mais PAS dans l'enum ErrorCode d'openapi.yaml.`)
    if (!ligne) ecarts.push(`"${demande}" est dans l'enum ErrorCode mais PAS dans le tableau §1.3 du cahier (pas de statut HTTP documente).`)

    const tests = cahier.testsContractuels().filter((t) => t.codes.includes(demande))
    const antiEnum = demande === 'NOT_FOUND' ? cahier.reglePasDEnumeration() : null

    const corps = [
      `Code    : ${demande}`,
      `HTTP    : ${ligne ? ligne.http : 'non documente par le cahier §1.3'}`,
      `Sens    : ${ligne ? ligne.sens : '(absent du cahier)'}`,
      `Enveloppe : { "error": { "code": "${demande}", "message": "...", "details": { ... } } }  (cahier §1.3)`,
      '',
      `Tests contractuels §13 qui couvrent ce code : ${
        tests.length ? tests.map((t) => `#${t.numero} « ${t.enonce} » (ligne ${t.ligne})`).join(' · ') : '(aucun)'
      }`,
      antiEnum ? `\nRegle anti-enumeration : ${antiEnum.texte}  (ligne ${antiEnum.ligne})` : null,
      ecarts.length ? `\nECART ENTRE LES DEUX FICHIERS :\n  · ${ecarts.join('\n  · ')}` : null,
    ]

    return texte(
      corps.filter(Boolean).join('\n'),
      [
        'docs/openapi.yaml, schema ErrorCode',
        ligne ? `${cahier.FICHIER} §1.3, ligne ${ligne.ligne}` : null,
      ],
    )
  },
}

// ---------------------------------------------------------------------------
// 6 — valider_payload
// ---------------------------------------------------------------------------

const sortieValidation = {
  conforme: z.boolean(),
  schema: z.string(),
  ecarts: z.array(
    z.object({
      chemin: z.string(),
      regle: z.string(),
      attendu: z.string(),
      recu: z.string(),
    }),
  ),
}

const validerPayload = {
  nom: 'valider_payload',
  config: {
    title: 'Valider un JSON contre un schema du contrat',
    description:
      'Valide un objet JSON contre un schema de docs/openapi.yaml (Ajv, JSON Schema 2020-12, ' +
      'schema dereference). Renvoie la liste des ecarts : chemin, regle violee, attendu, recu. ' +
      "C'est l'outil a appeler AVANT de coder une reponse d'API, pas apres l'integration.",
    inputSchema: {
      schema: z.string().describe('Nom du schema, ex. Reservation, CreateReservation, Slot'),
      json: z.string().describe('Le JSON a valider, sous forme de chaine'),
      sens: z.enum(['requete', 'reponse']).optional().describe('Informatif : sens du payload'),
    },
    outputSchema: sortieValidation,
    annotations: ANNOTATIONS,
  },
  async handler({ schema: nomSchema, json: brut, sens }) {
    const vide = { conforme: false, schema: String(nomSchema || ''), ecarts: [] }

    const s = oas.schema(nomSchema, true)
    if (s === null) {
      return absent(`le schema "${nomSchema}" n'existe pas dans docs/openapi.yaml.`, oas.nomsSchemas(), {
        donnees: vide,
      })
    }

    let donnees
    try {
      donnees = JSON.parse(brut)
    } catch (e) {
      return invalide(`le parametre \`json\` n'est pas du JSON valide : ${e.message}`, { donnees: vide })
    }

    const nettoye = sansExtensions(s)
    const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true })
    ajvFormats.default ? ajvFormats.default(ajv) : ajvFormats(ajv)

    let valider
    try {
      valider = ajv.compile(nettoye)
    } catch (e) {
      return invalide(
        `le schema "${nomSchema}" n'est pas compilable par Ajv : ${e.message}. ` +
          `C'est un defaut du contrat, a signaler, pas une erreur d'appel.`,
        { donnees: vide },
      )
    }

    const conforme = Boolean(valider(donnees))
    const ecarts = (valider.errors || []).map((e) => ({
      chemin: e.instancePath || '(racine)',
      regle: e.keyword,
      attendu: typeof e.params === 'object' ? JSON.stringify(e.params) : String(e.params),
      recu: apercu(lireChemin(donnees, e.instancePath)),
    }))

    const resultat = { conforme, schema: nomSchema, ecarts }
    const corps = conforme
      ? `CONFORME au schema ${nomSchema}${sens ? ` (sens : ${sens})` : ''}.`
      : `NON CONFORME au schema ${nomSchema}${sens ? ` (sens : ${sens})` : ''} — ${ecarts.length} ecart(s) :\n\n` +
        tableauTexte(ecarts, [
          { titre: 'CHEMIN', cle: 'chemin' },
          { titre: 'REGLE', cle: 'regle' },
          { titre: 'ATTENDU', cle: 'attendu' },
          { titre: 'RECU', cle: 'recu' },
        ])

    return structure(corps, resultat, [
      `docs/openapi.yaml, schema ${nomSchema}, ligne ${oas.ligneDuSchema(nomSchema) || '?'}`,
      'Validation : Ajv 2020-12 sur le schema dereference',
    ])
  },
}

/** Retire les extensions que ce serveur ajoute au dereferencement (`x-origine`…). */
function sansExtensions(noeud) {
  if (Array.isArray(noeud)) return noeud.map(sansExtensions)
  if (noeud == null || typeof noeud !== 'object') return noeud
  const out = {}
  for (const [k, v] of Object.entries(noeud)) {
    if (k.startsWith('x-')) continue
    out[k] = sansExtensions(v)
  }
  return out
}

function lireChemin(objet, pointeurJson) {
  if (!pointeurJson) return objet
  let n = objet
  for (const brut of pointeurJson.slice(1).split('/')) {
    if (n == null) return undefined
    n = n[brut.replace(/~1/g, '/').replace(/~0/g, '~')]
  }
  return n
}

function apercu(v) {
  if (v === undefined) return '(absent)'
  const t = typeof v === 'string' ? v : JSON.stringify(v)
  return t.length > 80 ? `${t.slice(0, 80)}…` : t
}

// ---------------------------------------------------------------------------
// 7 — contrat_champs_interdits
// ---------------------------------------------------------------------------

/**
 * Chaque regle porte la SECTION et le MOTIF de la phrase qui l'interdit. La phrase
 * est retrouvee dans le fichier au moment de l'appel : si elle a disparu, la regle
 * est renvoyee avec un avertissement, jamais comme un fait acquis.
 */
const INTERDITS = [
  {
    roles: ['manager_salle'],
    ressources: ['reservation', 'reservations', 'resa'],
    champs: ['signature_pdf_path (le PDF de signature)', 'qr_jti / token QR', 'deciplus_member_id'],
    section: '6',
    motif: 'Manager **n’a pas**',
  },
  {
    roles: ['manager_salle'],
    ressources: ['signature', 'signature_pdf', 'pdf'],
    champs: ['GET /reservations/{id}/signature.pdf — acces refuse au manager'],
    section: '8',
    motif: 'pas manager',
  },
  {
    roles: ['manager_salle', 'direction', 'staff', 'service'],
    ressources: ['vue_staff', 'vue', 'coach_reservations_staff'],
    champs: ['qr_jti', 'signature_pdf_path', 'deciplus_member_id'],
    section: '12',
    motif: 'Vues SQL recommandées',
  },
  {
    roles: ['coach'],
    ressources: ['profil', 'profile', 'me'],
    champs: ['status', 'deciplus_member_id', 'tokens de paiement (payplug_customer_id, paypal_vault_id)'],
    section: '5',
    motif: 'Champs profil autorisés',
  },
  {
    roles: ['public', 'anonyme'],
    ressources: ['slots', 'creneaux', 'grille'],
    champs: ['noms des coachs'],
    section: '4',
    motif: 'ne renvoie **pas** les noms des coachs',
  },
  {
    roles: ['coach', 'manager_salle', 'direction', 'service', 'public'],
    ressources: ['qr', 'token', 'payload_qr'],
    champs: ['nom du coach', 'deciplus_member_id', 'UUID de reservation en clair', 'secret HMAC'],
    section: '9',
    motif: '**pas** de nom',
  },
  {
    roles: ['coach', 'manager_salle', 'direction'],
    ressources: ['mail', 'email', 'notification'],
    champs: ['secret HMAC', 'deciplus_member_id dans le mail salle'],
    section: '11',
    motif: 'ne contiennent pas',
  },
  {
    roles: ['coach', 'manager_salle', 'direction', 'service'],
    ressources: ['audit', 'audit_log', 'coach_audit_logs'],
    champs: ['PAN de carte', 'token QR'],
    section: '3.8',
    motif: 'sans PAN, sans token QR',
  },
  {
    roles: ['coach', 'manager_salle', 'direction', 'service'],
    ressources: ['paiement', 'payment', 'carte', 'payment_methods'],
    champs: ['PAN', 'CVV', 'IBAN'],
    section: '7',
    motif: 'jamais de PAN',
  },
]

function citerDansCahier(section, motif) {
  const s = cahier.corpsDeSection(section)
  if (!s) return null
  const lignes = s.corps.split(/\r?\n/)
  const i = lignes.findIndex((l) => l.includes(motif))
  if (i < 0) return null
  return { ligne: s.ligne + 1 + i, texte: lignes[i].trim(), section }
}

const champsInterdits = {
  nom: 'contrat_champs_interdits',
  config: {
    title: 'Champs interdits pour un role',
    description:
      "Ce qu'il est INTERDIT d'exposer a un role sur une ressource, avec la phrase du cahier qui " +
      "l'interdit et son numero de ligne. A appeler AVANT d'ecrire une vue SQL, un SELECT ou un " +
      "serialiseur : c'est la regle la plus facile a violer sans s'en rendre compte.",
    inputSchema: {
      role: z.string().describe('coach | manager_salle | direction | service | public'),
      ressource: z
        .string()
        .describe('reservation | profil | slots | qr | signature | mail | audit | paiement | vue_staff'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ role, ressource }) {
    const r = normaliser(role)
    const res = normaliser(ressource)

    const regles = INTERDITS.filter(
      (x) => x.roles.some((v) => normaliser(v) === r) && x.ressources.some((v) => normaliser(v) === res),
    )

    if (!regles.length) {
      const rolesConnus = [...new Set(INTERDITS.flatMap((x) => x.roles))]
      const ressourcesConnues = [...new Set(INTERDITS.flatMap((x) => x.ressources))]
      return absent(
        `aucune interdiction ecrite pour le role "${role}" sur la ressource "${ressource}".`,
        [],
        {
          detail:
            `Roles couverts : ${rolesConnus.join(', ')}.\n` +
            `Ressources couvertes : ${ressourcesConnues.join(', ')}.\n` +
            `ATTENTION : « aucune interdiction ecrite » ne veut pas dire « autorise ». ` +
            `Le cahier §12 pose la matrice RLS : appeler matrice_rls avant de conclure.`,
        },
      )
    }

    const blocs = regles.map((x) => {
      const cit = citerDansCahier(x.section, x.motif)
      return (
        `INTERDIT (${role} / ${ressource}) :\n` +
        x.champs.map((c) => `  · ${c}`).join('\n') +
        `\n  Phrase du cahier §${x.section} : ${
          cit ? `« ${cit.texte} » (ligne ${cit.ligne})` : `INTROUVABLE — le motif "${x.motif}" n'est plus dans ${cahier.FICHIER} §${x.section}. Le cahier a change : revalider avec Junior.`
        }`
      )
    })

    return texte(
      `${blocs.join('\n\n')}\n\n` +
        `Rappel §12 : la RLS Postgres est EN PLUS des controles API, pas a la place. ` +
        `Un SELECT * derriere une vue mal faite est une fuite, meme avec un controle applicatif correct.`,
      regles.map((x) => `${cahier.FICHIER} §${x.section}`),
    )
  },
}

// ---------------------------------------------------------------------------
// 8 — contrat_recherche
// ---------------------------------------------------------------------------

const recherche = {
  nom: 'contrat_recherche',
  config: {
    title: 'Recherche plein texte dans le contrat',
    description:
      'Cherche une expression dans les documents de contrat et renvoie fichier, section, ligne et ' +
      "extrait. `.env.example` est volontairement EXCLU de cette recherche : ses lignes portent des " +
      'valeurs. Pour l\'environnement, utiliser proprietaire_env, qui ne renvoie que des noms.',
    inputSchema: {
      q: z.string().describe('Expression cherchee, insensible a la casse et aux accents'),
      fichiers: z
        .array(z.string())
        .optional()
        .describe(`Restreindre a certaines cles : ${DOCS_RECHERCHABLES.join(', ')}`),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ q, fichiers }) {
    const terme = normaliser(q)
    if (!terme) return invalide('`q` est vide.')

    const cles = fichiers && fichiers.length ? fichiers : DOCS_RECHERCHABLES
    const refuses = cles.filter((c) => !DOCS_RECHERCHABLES.includes(c))
    if (refuses.length) {
      return absent(`cle(s) de fichier hors perimetre de recherche : ${refuses.join(', ')}.`, DOCS_RECHERCHABLES, {
        detail:
          `.env.example est exclu par conception (G1) : cette recherche renverrait des extraits bruts, ` +
          `donc des valeurs. Utiliser proprietaire_env.`,
      })
    }

    const resultats = []
    for (const cle of cles) {
      let src
      try {
        src = lire(cle)
      } catch {
        continue
      }
      const sectionsDuFichier = cle === 'openapi' ? null : sectionsIndexees(src.texte)
      src.lignes.forEach((ligne, i) => {
        if (!normaliser(ligne).includes(terme)) return
        resultats.push({
          fichier: src.chemin,
          ligne: i + 1,
          section: sectionsDuFichier ? titreALaLigne(sectionsDuFichier, i + 1) : '',
          extrait: ligne.trim().slice(0, 200),
        })
      })
    }

    if (!resultats.length) {
      return absent(`"${q}" n'apparait dans aucun des documents de contrat (${cles.join(', ')}).`, [], {
        detail:
          "Le silence du contrat est une reponse : si le sujet n'est ecrit nulle part, il n'est pas tranche. " +
          'Ne pas coder une regle qui ne figure pas au contrat.',
      })
    }

    const limite = 60
    const montres = resultats.slice(0, limite)
    return texte(
      `${resultats.length} occurrence(s)${resultats.length > limite ? ` (les ${limite} premieres)` : ''} :\n\n` +
        tableauTexte(montres, [
          { titre: 'FICHIER', cle: 'fichier' },
          { titre: 'LIGNE', cle: 'ligne' },
          { titre: 'SECTION', cle: 'section' },
          { titre: 'EXTRAIT', cle: 'extrait' },
        ]),
      cles.map((c) => FICHIERS[c]),
    )
  },
}

function sectionsIndexees(t) {
  const out = []
  t.split(/\r?\n/).forEach((l, i) => {
    const m = /^(#{2,4})\s+(.*)$/.exec(l)
    if (m) out.push({ ligne: i + 1, titre: m[2].trim() })
  })
  return out
}

function titreALaLigne(index, ligne) {
  let titre = ''
  for (const s of index) {
    if (s.ligne <= ligne) titre = s.titre
    else break
  }
  return titre.slice(0, 40)
}

// ---------------------------------------------------------------------------
// 9 — contrat_version
// ---------------------------------------------------------------------------

const version = {
  nom: 'contrat_version',
  config: {
    title: 'Empreinte du contrat',
    description:
      'Pour chaque fichier de contrat : SHA-256, date de modification, taille, et le commit git ' +
      "courant. Le contrat bouge : une IA qui a lu un endpoint hier doit pouvoir constater que le " +
      'fichier a change. Un hachage est la seule facon honnete de le dire.',
    inputSchema: {},
    annotations: ANNOTATIONS,
  },
  async handler() {
    const fichiers = etatDesFichiers()

    // G5 : la seule execution externe toleree. execFile sans shell, arguments
    // litteraux, aucune entree utilisateur n'entre ici.
    let commit = null
    let branche = null
    try {
      const r = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: RACINE, timeout: 5000 })
      commit = r.stdout.trim()
      const b = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RACINE, timeout: 5000 })
      branche = b.stdout.trim()
    } catch (e) {
      commit = `(git indisponible : ${e.message.split('\n')[0]})`
    }

    const hachages = fichiers.map((f) => f.sha256).filter(Boolean)
    if (commit && /^[0-9a-f]{7,}$/.test(commit)) hachages.push(commit)

    const corps =
      `Depot   : ${RACINE}\n` +
      `Commit  : ${commit}\n` +
      `Branche : ${branche || '(inconnue)'}\n\n` +
      tableauTexte(fichiers, [
        { titre: 'FICHIER', cle: 'chemin' },
        { titre: 'SHA-256', cle: (f) => (f.sha256 ? f.sha256.slice(0, 16) + '…' : 'ABSENT') },
        { titre: 'MODIFIE LE (UTC)', cle: 'modifie_le' },
        { titre: 'OCTETS', cle: 'octets' },
      ]) +
      `\n\nSHA-256 complets :\n` +
      fichiers.map((f) => `  ${f.chemin} : ${f.sha256 || 'ABSENT'}`).join('\n')

    return {
      _garde_hachages: hachages,
      ...texte(corps, ['systeme de fichiers', 'git rev-parse HEAD']),
    }
  },
}

export const OUTILS = [
  listerEndpoints,
  endpoint,
  listerSchemas,
  schema,
  codeErreur,
  validerPayload,
  champsInterdits,
  recherche,
  version,
]
