import { resolve } from 'node:path'
import { isBuiltin } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { alias: { 'electron-log': 'electron-log/node' } },
  ssr: { noExternal: ['electron-log', 'ws'] },
  plugins: [{
    name: 'no-electron-runtime',
    resolveId(id) { if (id === 'electron' || id.startsWith('electron/')) throw new Error(`Headless runtime must not import ${id}.`) },
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (entry.type !== 'chunk') continue
        for (const dependency of [...entry.imports, ...entry.dynamicImports]) {
          if (!isBuiltin(dependency) && bundle[dependency] === undefined) throw new Error(`Unexpected headless runtime dependency: ${dependency}`)
        }
      }
      this.emitFile({ type: 'asset', fileName: 'package.json', source: JSON.stringify({ name: 'geckit-headless', private: true, type: 'module', engines: { node: '>=22' }, scripts: { start: 'node service.js' } }, undefined, 2) })
    },
  }],
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'out/service',
    sourcemap: true,
    commonjsOptions: { ignore: ['bufferutil', 'utf-8-validate'] },
    rollupOptions: {
      input: { service: resolve(import.meta.dirname, 'src/service/index.ts'), cli: resolve(import.meta.dirname, 'src/cli/index.ts') },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
})
