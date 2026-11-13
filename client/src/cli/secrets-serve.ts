import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SecretFileAsk { readonly op: string; readonly conversation?: string; readonly [key: string]: unknown }
type Handler = (ask: SecretFileAsk) => Promise<object>

let handler: Handler | undefined
const working = new Set<string>()

/** The service sets what answers `.secret` requests; until it does they are refused. */
export function setSecretsServer(next: Handler | undefined): void { handler = next }

/** Answers the `.secret` files a conversation leaves in the browser folder, outside any sandbox. */
export function serveSecretFiles(folder: string, files: readonly string[]): void {
  for (const file of files.filter((one) => one.endsWith('.secret'))) {
    const source = join(folder, file)
    if (working.has(source)) continue
    let ask: SecretFileAsk
    try { ask = JSON.parse(readFileSync(source, 'utf8')) as SecretFileAsk } catch { continue }
    rmSync(source, { force: true })
    working.add(source)
    const tell = (reply: object): void => {
      working.delete(source)
      try { writeFileSync(`${source}.told.part`, JSON.stringify(reply), { mode: 0o600 }); renameSync(`${source}.told.part`, `${source}.told`) } catch { /* the asker gave up */ }
    }
    if (handler === undefined) { tell({ ok: false, error: 'Secrets are not available in this GeckIt yet.' }); continue }
    handler(ask).then((result) => tell({ ok: true, ...result }), (error: Error) => tell({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
}
