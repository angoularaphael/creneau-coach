import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

/**
 * Politique de sécurité du contenu.
 *
 * `style-src 'unsafe-inline'` est toléré : Next injecte ses propres styles en ligne.
 * `script-src` reste sans nonce en v1 — le durcissement par nonce touche le rendu du
 * lot B, il fera l'objet d'une passe dédiée (voir .research/spec-01-next16.md §10.7).
 *
 * `frame-src` n'autorise que les deux tunnels de paiement du lot A. `frame-ancestors
 * 'none'` interdit que le tunnel de paiement ou le pad de signature soient encadrés
 * par un tiers — c'est l'exigence anti-clickjacking du cahier §2.4.
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
].join('; ')

const securite = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securite },
      {
        // API : aucun cache intermédiaire, aucune indexation.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // Surfaces privées : noindex au niveau réseau, en plus des metadata.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/espace-coach/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ]
  },
}

export default nextConfig
