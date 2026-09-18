import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  // Lot A (Raphael) : CommonJS, hors périmètre du lint TypeScript.
  { ignores: ['.next/**', 'node_modules/**', 'lib/**', 'bot/**', 'deploy/**', 'test/**', 'server.js', 'public/sign.html'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]
