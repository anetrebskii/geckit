import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Chat window comes from the desktop app's own sources, and so does React, from its node_modules.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(import.meta.dirname, '../client/node_modules/react'),
      'react-dom': resolve(import.meta.dirname, '../client/node_modules/react-dom'),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'www', emptyOutDir: true },
})
