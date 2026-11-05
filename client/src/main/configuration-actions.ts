import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { ConfigurationApi } from '../shared/api'
import { importableConfiguration } from '../core/configuration-transfer'

interface ConfigurationActions {
  readonly directory: string
  readonly chooseExport: () => Promise<string | undefined>
  readonly chooseImport: () => Promise<string | undefined>
  readonly confirmImport: () => Promise<boolean>
  readonly export: () => Promise<string>
  readonly import: (text: string) => Promise<void>
  readonly reveal: (path: string) => void
  readonly restart: () => void
}

export function configurationActions(actions: ConfigurationActions): ConfigurationApi {
  let busy = false
  const run = async <T>(action: () => Promise<T>): Promise<T> => {
    if (busy) throw new Error('A configuration operation is already in progress.')
    busy = true
    try { return await action() } finally { busy = false }
  }
  return {
    reveal: () => run(async () => {
      const path = join(actions.directory, 'settings.json')
      if (!existsSync(path)) throw new Error('The configuration file is not available. Reconnect GeckIt and try again.')
      actions.reveal(path)
    }),
    export: () => run(async () => {
      const destination = await actions.chooseExport()
      if (destination === undefined) return false
      const path = resolve(destination)
      const parent = realpathSync(dirname(path))
      const inside = relative(realpathSync(actions.directory), join(parent, basename(path)))
      if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)) throw new Error('Choose a destination outside GeckIt’s data folder.')
      const text = await actions.export()
      const temporary = join(parent, `.geckit-export-${randomUUID()}.json`)
      try {
        writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' })
        renameSync(temporary, path)
      } finally { rmSync(temporary, { force: true }) }
      return true
    }),
    import: () => run(async () => {
      const path = await actions.chooseImport()
      if (path === undefined) return false
      const text = readFileSync(path, 'utf8')
      importableConfiguration(text)
      if (!await actions.confirmImport()) return false
      await actions.import(text)
      actions.restart()
      return true
    }),
  }
}
