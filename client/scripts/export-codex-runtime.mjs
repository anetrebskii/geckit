import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const result = await build({
  stdin: {
    contents: "export { launchCodex } from './src/main/sessions/codex-rpc'; export { linksIn } from './src/shared/links'; export { CodexSessions } from './src/main/sessions/codex'; export { readCodexBrowsers } from './src/main/sessions/codex-browsers'; export { providerQuotas } from './src/shared/provider-usage';",
    resolveDir: root,
    sourcefile: 'codex-runtime.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['electron'],
  banner: { js: "// Copied from GeckIt. Editable plugin-owned implementation; no host.codex calls.\nimport { createRequire as geckitCreateRequire } from 'node:module';\nconst require = geckitCreateRequire(import.meta.url);" },
  write: false,
  minify: false,
  legalComments: 'inline',
})
await writeFile(resolve(root, '../examples/codex-provider/src/codex-runtime.mjs'), result.outputFiles[0].text)
