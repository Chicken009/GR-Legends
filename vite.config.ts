import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages liefert die App unter /<repo>/ aus
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // Auch ältere Handy-Browser (z. B. Safari 14) unterstützen
  build: { target: ['es2020', 'safari14'] },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
