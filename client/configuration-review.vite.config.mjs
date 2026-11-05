import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const client = import.meta.dirname
export default defineConfig({
  root: resolve(client, '..'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
  resolve: { alias: { react: resolve(client, 'node_modules/react'), 'react-dom': resolve(client, 'node_modules/react-dom') } },
  optimizeDeps: { entries: ['docs/design/configuration-transfer.html'] },
})
