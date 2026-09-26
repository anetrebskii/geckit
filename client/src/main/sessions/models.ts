import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'

import type { ClaudeModel } from '../../shared/api'
import { claudeCommand, planOnly } from './account'

/**
 * Which models the tool has, as the tool itself says.
 *
 * Asked and never kept in a table here: a table is out of date the week a
 * vendor ships a model, and wrong for every account that has one another does
 * not. Claude Code names its models to the program driving it, in its answer
 * to the greeting on the channel the permission requests arrive on. The tool's
 * own settings are not read to find out what it would run by itself: that is
 * what Default is, and Default hands the tool nothing.
 */

type Json = Readonly<Record<string, unknown>>

const string = (value: unknown): string => (typeof value === 'string' ? value : '')

/** How long the tool is waited on, which is what `claude auth status` is given. */
const PATIENCE = 15_000

/**
 * From Claude Code's answer to the greeting.
 *
 * Its own `default` row is left out: asked with the tool set to Haiku it still
 * described its default as Opus 5, so the row names the plan's default and not
 * what this machine would run.
 *
 * A model the plan has and this build cannot run is named apart, with the
 * tool's own reason: `Update to 2.1.280+ to use Opus 5.5`. It is kept, greyed,
 * because it is the one thing that says the list is short for want of an
 * update. The id it gives such a row is a placeholder and not a model's.
 */
export function claudeModelsFrom(answer: Json): ClaudeModel[] | undefined {
  const listed = answer['models']
  if (!Array.isArray(listed)) return undefined
  const unusable = answer['unavailable_models']
  const models: ClaudeModel[] = []
  for (const [raw, off] of [
    ...listed.map((one: unknown) => [one, false] as const),
    ...(Array.isArray(unusable) ? unusable.map((one: unknown) => [one, true] as const) : []),
  ]) {
    const one = (raw ?? {}) as Json
    const value = string(one['value'])
    if (value === '' || value === 'default') continue
    const says = string(one['description'])
    const disabled = off || one['disabled'] === true
    const id = disabled ? '' : string(one['resolvedModel'])
    models.push({
      value,
      name: string(one['displayName']) || value,
      ...(says === '' ? {} : { says }),
      ...(id === '' ? {} : { id }),
      ...(disabled ? { disabled: true as const } : {}),
    })
  }
  return models
}

/**
 * Claude Code, started once, greeted, and let go.
 *
 * Nothing is sent to any model and nothing is spent: the process is given no
 * message, and it is ended at its answer. It leaves no session behind. It is
 * started in the home folder so that a project's own start-up hooks are not
 * run for a question that is not about the project.
 */
export function claudeModels(): Promise<ClaudeModel[] | undefined> {
  return new Promise((done) => {
    const child = spawn(
      claudeCommand(),
      ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'],
      { cwd: homedir(), stdio: ['pipe', 'pipe', 'ignore'], env: planOnly(), windowsHide: true },
    )
    let over = false
    const finish = (models: ClaudeModel[] | undefined): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      child.stdin.end()
      child.kill()
      done(models)
    }
    const patience = setTimeout(() => finish(undefined), PATIENCE)

    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: Json
      try {
        message = JSON.parse(line) as Json
      } catch {
        return
      }
      if (message['type'] !== 'control_response') return
      const response = (message['response'] ?? {}) as Json
      finish(response['subtype'] === 'success' ? claudeModelsFrom((response['response'] ?? {}) as Json) : undefined)
    })
    child.on('error', () => finish(undefined))
    child.on('close', () => finish(undefined))
    child.stdin.on('error', () => undefined)
    child.stdin.write(
      `${JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })}\n`,
    )
  })
}
