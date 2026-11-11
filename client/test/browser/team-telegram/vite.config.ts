import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ root: resolve(import.meta.dirname, '../../..'), plugins: [react()], server: { host: '127.0.0.1', port: 5297, strictPort: true, fs: { allow: [resolve(import.meta.dirname, '../../..'), realpathSync(resolve(import.meta.dirname, '../../../node_modules'))] } } })
