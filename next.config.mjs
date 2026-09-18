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

const isProd = process.env.NODE_ENV === 'production';

/**
 * Politique de sécurité du contenu.
 *
 * `style-src 'unsafe-inline'` est toléré : Next injecte ses propres styles en ligne.
 * `script-src` reste sans nonce en v1 — le durcir touche le rendu du lot B et fera
 * l'objet d'une passe dédiée.
 *
 * `frame-ancestors 'none'` est l'exigence anti-clickjacking du cahier §2.4 : ni le
 * tunnel de paiement, ni le pad de signature ne doivent pouvoir être encadrés par
 * un tiers. `frame-src` n'ouvre que les deux prestataires de paiement du lot A.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self'${isProd ? '' : " 'unsafe-eval'"}`,
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  'frame-src https://secure.payplug.com https://www.paypal.com',
  'upgrade-insecure-requests',
].join('; ');

const securite = [
  { key: 'Content-Security-Policy', value: csp },
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
