import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The Chat window comes from the desktop app's own sources, and so does React, from its node_modules.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Where the phone's errors go once somebody says they may, from GECKIT_SENTRY_DSN or mobile/.env; empty, nothing is sent.
  define: { __SENTRY_DSN__: JSON.stringify(loadEnv(mode, import.meta.dirname, 'GECKIT_').GECKIT_SENTRY_DSN ?? '') },
  resolve: {
    alias: {
      react: resolve(import.meta.dirname, '../client/node_modules/react'),
      'react-dom': resolve(import.meta.dirname, '../client/node_modules/react-dom'),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'www', emptyOutDir: true },
}))
