/**
 * Configuration Next — FICHIER UNIQUE.
 *
 * Il a existé un moment un `next.config.ts` ET un `next.config.mjs`. Next n'en
 * charge qu'un seul, et le `.mjs` l'emporte : la configuration la plus complète
 * était ignorée en silence. Concrètement, la CSP, le HSTS, la Permissions-Policy,
 * le `no-store` sur l'API et le `noindex` sur /admin n'étaient plus servis, alors
 * que le fichier qui les déclarait était bien dans le dépôt.
 *
 * Un seul fichier de configuration. Ne pas en recréer un second, quelle que soit
 * son extension.
 */

/**
 * OÙ VIT LA POLITIQUE DE SÉCURITÉ DU CONTENU — et pourquoi à deux endroits.
 *
 * Pour tout le site, elle est posée PAR REQUÊTE dans `src/proxy.ts`, avec un
 * nonce. C'est la seule façon d'autoriser les scripts d'amorçage de Next sans
 * ouvrir `'unsafe-inline'` à tout le monde : un en-tête statique ne sait pas
 * fabriquer une valeur imprévisible à chaque appel.
 *
 * SAUF `/admin`. Le matcher du proxy exclut cette route depuis que le lot A a
 * constaté qu'elle y perdait le `Set-Cookie` de son login. Le back-office
 * n'était donc plus couvert du tout : c'est un trou, sur la surface la plus
 * sensible du site, et il se rebouche ici.
 *
 * La politique ci-dessous est plus faible d'un cran, et il faut le dire : sans
 * proxy il n'y a pas de nonce, donc `script-src` doit tolérer l'inline pour que
 * la page démarre. Tout le reste reste fermé — l'origine, les cadres, les
 * formulaires, les connexions sortantes. Mieux vaut un cran de moins partout
 * qu'un back-office à nu.
 *
 * `frame-ancestors 'none'` est l'exigence anti-clickjacking du cahier §2.4 : ni
 * le tunnel de paiement, ni le pad de signature ne doivent pouvoir être encadrés
 * par un tiers.
 */
const CSP_ADMIN = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  'upgrade-insecure-requests',
].join('; ')
/*
 * La Content-Security-Policy N'EST PLUS ICI — elle est dans `src/proxy.ts`.
 *
 * Elle y était posée en en-tête statique, avec `script-src 'self'`. Or Next
 * injecte des scripts EN LIGNE pour amorcer l'hydratation : ils étaient bloqués,
 * React n'hydratait jamais, et TOUT le site était inerte. Pas d'animation au
 * défilement, pas de bascule, pas un seul gestionnaire d'événement — sur toutes
 * les pages, depuis que cette CSP existait.
 *
 * Un nonce doit être imprévisible et différent à chaque requête : un en-tête
 * statique ne peut pas le produire. Seul le proxy le peut.
 */
const securite = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Remplacé par `frame-ancestors` sur les navigateurs récents ; gardé pour les autres.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * `typedRoutes` reste désactivé (c'est le défaut). Activé, il exige que chaque
   * `href` soit un littéral de route connu au build ; les trois lots construisent
   * leurs liens dynamiquement, ce qui produisait 59 erreurs de type sur du code
   * correct à l'exécution. À reprendre dans une passe dédiée, en castant les
   * `href` calculés en `as Route`.
   */
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securite },
      {
        // L'API ne se met jamais en cache intermédiaire et ne s'indexe jamais.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // Surfaces privées : noindex au niveau réseau, en plus des metadata et de robots.ts.
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          // Le proxy ne passe pas ici : voir la note en tête de fichier.
          { key: 'Content-Security-Policy', value: CSP_ADMIN },
        ],
      },
      {
        source: '/espace-coach/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
