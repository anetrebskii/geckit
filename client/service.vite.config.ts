import { resolve } from 'node:path'
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { alias: { 'electron-log': 'electron-log/node' } },
  ssr: { noExternal: true, external: ['node-datachannel'] },
  plugins: [{
    name: 'no-electron-runtime',
    resolveId(id) { if (id === 'electron' || id.startsWith('electron/')) throw new Error(`Headless runtime must not import ${id}.`) },
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (entry.type !== 'chunk') continue
        for (const dependency of [...entry.imports, ...entry.dynamicImports]) {
          if (!isBuiltin(dependency) && dependency !== 'node-datachannel' && bundle[dependency] === undefined) throw new Error(`Unexpected headless runtime dependency: ${dependency}`)
        }
      }
      this.emitFile({ type: 'asset', fileName: 'package.json', source: JSON.stringify({ name: 'geckit-headless', private: true, type: 'module', engines: { node: '>=22' }, scripts: { start: 'node service.js' } }, undefined, 2) })
    },
    writeBundle() {
      const require = createRequire(import.meta.url)
      const target = resolve(import.meta.dirname, 'out/service/node_modules')
      mkdirSync(target, { recursive: true })
      const native = resolve(import.meta.dirname, 'node_modules/@node-datachannel')
      const packages = readdirSync(native).map((name) => `@node-datachannel/${name}`)
      for (const name of ['node-datachannel', 'detect-libc', ...packages]) {
        const folder = name === 'node-datachannel' ? resolve(require.resolve(name), '../../../..') : resolve(require.resolve(`${name}/package.json`), '..')
        cpSync(folder, resolve(target, name), { recursive: true })
      }
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
