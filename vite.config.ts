import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Content-Security-Policy für den Produktions-Build: Skripte nur von der eigenen Seite (plus
 * Hash der Inline-Skripte), Daten nur von den Google-APIs, Bilder nur von Drive.
 */
function csp(): Plugin {
  return {
    name: 'gr-legends-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          // Drive-Vorschaubilder leiten auf lh3.google… um; blob: für per API geladene Fotos
          "img-src 'self' data: blob: https://*.google.com https://*.googleusercontent.com",
          // Drive kann Datei-Downloads auf googleusercontent.com umleiten
          'connect-src https://www.googleapis.com https://sheets.googleapis.com https://*.googleusercontent.com',
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join('; ')
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages liefert die App unter /<repo>/ aus
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), csp()],
  // Auch ältere Handy-Browser (z. B. Safari 14) unterstützen
  build: { target: ['es2020', 'safari14'] },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
