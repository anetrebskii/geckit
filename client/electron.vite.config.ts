import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const here = import.meta.dirname
// Where errors go once somebody says they may; empty, nothing is sent.
const sentry = JSON.stringify(process.env['GECKIT_SENTRY_DSN'] ?? '')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __SIGNED__: JSON.stringify(process.env['GECKIT_SIGNED'] === 'true'),
      __SENTRY_DSN__: sentry,
    },
    build: {
      rollupOptions: { input: { index: resolve(here, 'src/main/index.ts'), cli: resolve(here, 'src/cli/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(here, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(here, 'src/renderer'),
    plugins: [react()],
    define: { __SENTRY_DSN__: sentry },
    build: {
      rollupOptions: {
        input: {
          panel: resolve(here, 'src/renderer/panel.html'),
          chat: resolve(here, 'src/renderer/chat.html'),
          voice: resolve(here, 'src/renderer/voice.html'),
          peer: resolve(here, 'src/renderer/peer.html'),
        },
      },
    },
  },
})
