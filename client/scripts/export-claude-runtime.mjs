import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, '../../geckit-claude-tmux/src/claude-runtime.mjs')
const result = await build({
  stdin: {
    contents: "export { claudeAccount, claudeCommand, claudeProgram, OFF_PLAN, planOnly } from './src/main/sessions/account'; export { claudeState, readClaude } from './src/main/sessions/claude-read'; export { readBrowsers } from './src/main/sessions/chrome'; export { claudeFile, deleteClaude, everyClaude, forkPoint, listClaude, readClaudeSession, readGoal, readLinks } from './src/main/sessions/disk'; export { readMcp } from './src/main/sessions/mcp'; export { claudeModels } from './src/main/sessions/models'; export { searchClaude } from './src/main/sessions/search';",
    resolveDir: root,
    sourcefile: 'claude-runtime.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['electron'],
  banner: { js: "// Copied from GeckIt. Editable plugin-owned implementation; no host.claude calls.\nimport { createRequire as geckitCreateRequire } from 'node:module';\nconst require = geckitCreateRequire(import.meta.url);" },
  write: false,
  minify: false,
  legalComments: 'inline',
})
await writeFile(target, result.outputFiles[0].text)
