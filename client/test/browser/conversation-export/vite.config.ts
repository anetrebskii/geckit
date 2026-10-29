import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(import.meta.dirname, '../../..'),
  plugins: [react()],
  resolve: { alias: { electron: resolve(import.meta.dirname, 'electron.ts') } },
  define: { 'process.platform': JSON.stringify('darwin'), 'process.env': '{}' },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
})
