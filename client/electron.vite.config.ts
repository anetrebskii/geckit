import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

const here = import.meta.dirname
const CSS_FILE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/

// Vite links a removed CSS-only chunk (styles.css, shared by every window) after the page's own CSS, the reverse of dev, so it is put first here.
function sharedCssFirst(): Plugin {
  return {
    name: 'geckit:shared-css-first',
    apply: 'build',
    generateBundle: {
      order: 'pre',
      handler(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk' || chunk.viteMetadata === undefined) continue
          const shared: string[] = []
          for (const file of chunk.imports) {
            const one = bundle[file]
            if (one?.type !== 'chunk' || one.viteMetadata === undefined || one.exports.length > 0 || one.moduleIds.length === 0 || !one.moduleIds.every((id) => CSS_FILE.test(id))) continue
            shared.push(...one.viteMetadata.importedCss)
          }
          if (shared.length === 0) continue
          const own = [...chunk.viteMetadata.importedCss]
          chunk.viteMetadata.importedCss.clear()
          for (const file of [...shared, ...own]) chunk.viteMetadata.importedCss.add(file)
        }
      },
    },
  }
}

// Where errors go once somebody says they may: the geckit project in Sentry, public as a DSN is meant to be.
const sentry = JSON.stringify(process.env['GECKIT_SENTRY_DSN'] ?? 'https://a78cad3df91c69a20c2472e731eb8300@o4511866894942208.ingest.us.sentry.io/4512169996124160')

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
    plugins: [react(), sharedCssFirst()],
    define: { __SENTRY_DSN__: sentry },
    build: {
      rollupOptions: {
        input: {
          panel: resolve(here, 'src/renderer/panel.html'),
          chat: resolve(here, 'src/renderer/chat.html'),
          remoteWorkspace: resolve(here, 'src/renderer/remote-workspace.html'),
          connectionStorage: resolve(here, 'src/renderer/connection-storage.html'),
          voice: resolve(here, 'src/renderer/voice.html'),
          peer: resolve(here, 'src/renderer/peer.html'),
          gecko: resolve(here, 'src/renderer/gecko.html'),
        },
      },
    },
  },
})
