/**
 * G6 — filet anti-fuite en sortie.
 *
 * Toute reponse d'outil, de resource et de prompt passe ici avant de partir.
 * Si un motif de secret est detecte, la reponse est REMPLACEE par une erreur.
 *
 * Ce filet ne devrait jamais se declencher : G1 (aucun fichier de secrets lu),
 * G2 (liste blanche) et G3 (aucun pilote de base installe) le rendent
 * theoriquement inutile. C'est exactement pour ca qu'il existe — le jour ou il
 * se declenche, c'est qu'une garantie precedente a cede.
 */

export const MOTIFS = Object.freeze([
  { nom: 'cle_payplug_live', regex: /\bsk_live_[A-Za-z0-9]{6,}/ },
  { nom: 'cle_payplug_test', regex: /\bsk_test_[A-Za-z0-9]{6,}/ },
  { nom: 'secret_webhook', regex: /\bwhsec_[A-Za-z0-9]{6,}/ },
  { nom: 'jeton_jwt', regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { nom: 'cle_privee_pem', regex: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { nom: 'hexadecimal_32_et_plus', regex: /\b[0-9a-fA-F]{32,}\b/ },
])

/**
 * @param {string} texte
 * @param {{ hachages_autorises?: Iterable<string> }} [options]
 *   `hachages_autorises` : les valeurs hexadecimales que le serveur a lui-meme
 *   calculees (SHA-256 des fichiers de contrat, commit git). Elles sont retirees
 *   du texte AVANT le scan — sinon `contrat_version` declencherait son propre filet.
 * @returns {{ propre: boolean, motif?: string, extrait?: string }}
 */
export function scanner(texte, options = {}) {
  if (typeof texte !== 'string' || texte.length === 0) return { propre: true }

  let aScanner = texte
  for (const h of options.hachages_autorises || []) {
    if (typeof h === 'string' && h.length >= 8) {
      aScanner = aScanner.split(h).join('[hachage-calcule-par-le-serveur]')
    }
  }

  for (const { nom, regex } of MOTIFS) {
    const trouve = aScanner.match(regex)
    if (trouve) {
      const brut = trouve[0]
      return {
        propre: false,
        motif: nom,
        extrait: `${brut.slice(0, 6)}…(${brut.length} caracteres)`,
      }
    }
  }
  return { propre: true }
}

/**
 * Enveloppe un resultat d'outil. Renvoie le resultat tel quel s'il est propre,
 * sinon une erreur metier explicite (isError, pas une exception JSON-RPC).
 * @param {{ content?: Array<{type:string, text?:string}>, structuredContent?: object, isError?: boolean }} resultat
 * @param {{ hachages_autorises?: Iterable<string>, outil?: string }} [options]
 */
export function proteger(resultat, options = {}) {
  const morceaux = []
  for (const bloc of resultat?.content || []) {
    if (bloc && typeof bloc.text === 'string') morceaux.push(bloc.text)
  }
  if (resultat?.structuredContent) {
    try {
      morceaux.push(JSON.stringify(resultat.structuredContent))
    } catch {
      /* structure non serialisable : rien a scanner de plus */
    }
  }

  const verdict = scanner(morceaux.join('\n'), options)
  if (verdict.propre) return resultat

  return {
    content: [
      {
        type: 'text',
        text:
          `FUITE INTERCEPTEE (garde G6). L'outil "${options.outil || 'inconnu'}" allait renvoyer ` +
          `un motif de secret : ${verdict.motif} (${verdict.extrait}).\n` +
          `La reponse a ete supprimee en entier.\n\n` +
          `Ce filet ne devrait jamais se declencher. S'il se declenche, une garantie a cede : ` +
          `verifier la liste blanche de mcp/lib/sources.mjs, puis prevenir Junior avant tout autre usage.`,
      },
    ],
    isError: true,
  }
}
