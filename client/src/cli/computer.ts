import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where an assistant leaves a command for another computer: a folder rather than a socket, as for Chrome, so a sandboxed conversation can reach it. */
export const computersFolder = (root: string = homedir()): string => join(root, '.geckit', 'computers')
export interface KnownComputer { readonly id: string; readonly name: string }

/** The command line with --computer <name> taken out, and the name, when it is there. */
export function computerArg(args: readonly string[]): { readonly computer?: string; readonly args: readonly string[] } | string {
  const at = args.indexOf('--computer')
  if (at < 0) return { args }
  const computer = args[at + 1]
  if (computer === undefined || computer.startsWith('--')) return 'Give the computer: --computer <name>, from geckit computers.'
  const rest = [...args.slice(0, at), ...args.slice(at + 2)]
  if (rest.includes('--computer')) return 'Name one computer.'
  return { computer, args: rest }
}

export function knownComputers(folder: string = computersFolder()): KnownComputer[] {
  try { return JSON.parse(readFileSync(join(folder, 'list.json'), 'utf8')) as KnownComputer[] } catch { return [] }
}

export function noteComputers(computers: readonly KnownComputer[], folder: string = computersFolder()): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'list.json.part'), JSON.stringify(computers))
  renameSync(join(folder, 'list.json.part'), join(folder, 'list.json'))
}

/** Runs a GeckIt command on a paired computer, through the GeckIt service here. */
export async function onComputer(computer: string, args: readonly string[], folder: string = computersFolder()): Promise<{ readonly ok: boolean; readonly said: string }> {
  const name = randomUUID()
  const asked = join(folder, `${name}.ask`)
  try {
    mkdirSync(folder, { recursive: true })
    writeFileSync(`${asked}.part`, JSON.stringify({ computer, args }))
    renameSync(`${asked}.part`, asked)
  } catch { return { ok: false, said: `This sandbox may not write to ${folder}, where commands for other computers are left. GeckIt's own conversations may; elsewhere ask the person to allow writing there.` } }
  const told = join(folder, `${name}.told`)
  for (let waited = 0; waited < 130_000; waited += 100) {
    await new Promise((done) => setTimeout(done, 100))
    try {
      const reply = JSON.parse(readFileSync(told, 'utf8')) as { ok: boolean; said: string }
      rmSync(told, { force: true })
      return reply
    } catch { continue }
  }
  rmSync(asked, { force: true })
  return { ok: false, said: `${computer} did not answer, or GeckIt is not running here.` }
}
