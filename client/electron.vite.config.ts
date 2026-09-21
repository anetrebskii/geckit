import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const here = import.meta.dirname

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(here, 'src/main/index.ts') } },
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
    build: {
      rollupOptions: {
        input: {
          panel: resolve(here, 'src/renderer/panel.html'),
          chat: resolve(here, 'src/renderer/chat.html'),
          voice: resolve(here, 'src/renderer/voice.html'),
        },
      },
    },
  },
})
