import react from '/Users/alex/Projects/mine/geckit/client/node_modules/@vitejs/plugin-react/dist/index.js'
let fixture
export default {
  root: '/private/tmp/geckit-manager-history/client/src/renderer',
  plugins: [react(), {
    name: 'isolated-manager-history',
    configureServer(server) {
      server.middlewares.use('/__manager-history', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        try {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return }
          let body = ''
          for await (const chunk of request) body += chunk
          const input = JSON.parse(body)
          fixture ??= server.ssrLoadModule('/@fs/private/tmp/geckit-manager-history/client/src/main/manager-history-preview.ts').then((module) => module.createHistoryPreview())
          const result = await (await fixture).call(input.method, input.args)
          response.end(JSON.stringify({ result }))
        } catch (error) {
          response.statusCode = 500
          response.end(JSON.stringify({ error: error.message }))
        }
      })
    },
  }],
  define: { __SENTRY_DSN__: '""' },
  server: { host: '127.0.0.1', port: 5191, strictPort: true, fs: { allow: ['/private/tmp/geckit-manager-history', '/Users/alex/Projects/mine/geckit/client/node_modules'] } },
}
