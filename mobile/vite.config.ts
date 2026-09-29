import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The Chat window comes from the desktop app's own sources, and so does React, from its node_modules.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Where the phone's errors go once somebody says they may: the same geckit project in Sentry, tagged app: phone.
  define: { __SENTRY_DSN__: JSON.stringify(loadEnv(mode, import.meta.dirname, 'GECKIT_').GECKIT_SENTRY_DSN ?? 'https://a78cad3df91c69a20c2472e731eb8300@o4511866894942208.ingest.us.sentry.io/4512169996124160') },
  resolve: {
    alias: {
      react: resolve(import.meta.dirname, '../client/node_modules/react'),
      'react-dom': resolve(import.meta.dirname, '../client/node_modules/react-dom'),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'www', emptyOutDir: true },
}))
