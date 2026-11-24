import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = import.meta.dirname

// The page a shared link opens, built into signal/ for Firebase Hosting; the service worker keeps its own name at the root.
export default defineConfig({
  root: resolve(here, 'src/viewer'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(here, '../signal/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(here, 'src/viewer/index.html'), 404: resolve(here, 'src/viewer/404.html'), secret: resolve(here, 'src/viewer/secret.html'), browser: resolve(here, 'src/viewer/browser.html'), sw: resolve(here, 'src/viewer/sw.ts') },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
})
