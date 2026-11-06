import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = resolve(import.meta.dirname, '../../..')

export default defineConfig({
  root,
  define: { __SENTRY_DSN__: JSON.stringify('') },
  plugins: [react(), {
    name: 'remote-workspace-harness',
    configureServer(server) {
      server.middlewares.use('/remote-workspace.html', (_request, response, next) => {
        void readFile(resolve(root, 'src/renderer/remote-workspace.html'), 'utf8').then((html) => server.transformIndexHtml('/remote-workspace.html', html.replace('/src/remote/workspace-entry.ts', '/src/renderer/src/remote/workspace-entry.ts'))).then((html) => {
          response.setHeader('Content-Type', 'text/html')
          response.end(html)
        }).catch(next)
      })
    },
  }],
})
