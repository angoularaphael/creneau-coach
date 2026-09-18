import 'server-only'

/**
 * Couche d'accès aux données — le seul endroit où l'on décide « ce compte a-t-il
 * le droit ». Spec : `.research/spec-04-securite.md` §2.
 *
 * ═══ LES QUATRE RÈGLES, RAPPELÉES ICI PARCE QU'ELLES SE PERDENT VITE ═══
 *
 * 1. `import 'server-only'` en tête de CHAQUE module. Pas « des modules
 *    sensibles » : chacun. La barrière ne vaut que si personne ne l'enlève
 *    « juste pour ce fichier-là ».
 *
 * 2. Les lectures d'un coach passent par le client PORTEUR DE SESSION, jamais
 *    par `service_role`. La RLS est le second mur, et un second mur ne sert que
 *    s'il est réellement traversé. `service_role` n'existe que pour les
 *    compteurs, les nonces et l'audit — des tables sans utilisateur.
 *
 * 3. Hors périmètre = 404, jamais 403 (cahier §1.3). Et la vraie raison part
 *    dans `authz.denied`, sinon une sonde systématique est indiscernable d'une
 *    faute de frappe.
 *
 * 4. La suspension se lit EN BASE, pas dans le jeton : un coach suspendu à 14h00
 *    garde un JWT valide jusqu'à 14h59.
 */

export * from './acteur'
export * from './reservations'
export * from './profil'
export * from './staff'
export * from './clubs'
export * from './map'
export * from './page'
