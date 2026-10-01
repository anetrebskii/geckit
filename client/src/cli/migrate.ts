import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'

import { migrateCodexMetadata, sessionImportsPath } from '../main/session-migration'
import type { MigrationAnswered, MigrationAsked, MigrationReport } from '../main/session-migration'

export function migrationRequest(folder: string, request: MigrationAsked): Promise<MigrationAnswered> {
  return new Promise((done) => {
    const socket = connect(join(folder, 'geckit.sock'))
    let rest = ''
    socket.setEncoding('utf8')
    socket.setTimeout(30_000, () => {
      socket.destroy()
      done({ ok: false, error: 'GeckIt did not answer the migration request.' })
    })
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (part: string) => { rest += part })
    socket.on('end', () => {
      try {
        const answer = JSON.parse(rest) as MigrationAnswered
        done(answer.ok && answer.report === undefined ? { ok: false, error: 'Restart GeckIt to load support for migrate-codex.' } : answer)
      } catch {
        done({ ok: false, error: 'GeckIt closed before answering the migration request.' })
      }
    })
    socket.on('error', () => done({ ok: false, error: 'Could not reach GeckIt. Quit it before migrating its files.' }))
  })
}

export async function migrate(args: readonly string[], folder: string): Promise<{ readonly ok: boolean; readonly said: string }> {
  const index = args.indexOf('--imports')
  const supplied = index < 0 ? sessionImportsPath() : args[index + 1]
  if (supplied === undefined || supplied.startsWith('--')) return { ok: false, said: '--imports needs the path to the Codex import manifest.' }
  const file = resolve(supplied)
  const dryRun = args.includes('--dry-run')
  let report: MigrationReport
  try {
    if (existsSync(join(folder, 'geckit.sock'))) {
      const answer = await migrationRequest(folder, { action: 'migrate-codex', imports: file, dryRun })
      if (!answer.ok) return { ok: false, said: answer.error }
      report = answer.report
    } else report = migrateCodexMetadata(folder, file, dryRun)
  } catch (error) {
    return { ok: false, said: error instanceof Error ? error.message : String(error) }
  }
  return {
    ok: true,
    said: args.includes('--json') ? JSON.stringify(report, null, 2) : [
      `${dryRun ? 'Would migrate' : 'Migrated'} ${report.migrated} conversations; ${report.unchanged} unchanged; ${report.missing} have no GeckIt metadata.`,
      `${dryRun ? 'Would move' : 'Moved'} ${report.favorites} favorites and ${report.order} board positions to Codex.`,
      ...(report.backup === undefined ? [] : [`Backup: ${report.backup}`]),
    ].join('\n'),
  }
}
