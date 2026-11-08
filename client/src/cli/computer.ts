import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where an assistant leaves a command for another computer: a folder rather than a socket, as for Chrome, so a sandboxed conversation can reach it. */
export const computersFolder = (root: string = homedir()): string => join(root, '.geckit', 'computers')
export interface KnownComputer { readonly id: string; readonly name: string }

/** Selects one paired GeckIt computer; `local` explicitly keeps execution here. */
export function computerArg(args: readonly string[]): { readonly computer?: string; readonly args: readonly string[] } | string {
  const rest: string[] = []
  let computer: string | undefined
  let selected = false
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''
    if (word === '--') { rest.push(...args.slice(at)); break }
    const flag = word.split('=', 1)[0]
    if (flag !== '--host' && flag !== '--computer') { rest.push(word); continue }
    if (selected) return 'Name one host using --host or --computer.'
    selected = true
    const equals = word.indexOf('=')
    const value = equals < 0 ? args[++at] : word.slice(equals + 1)
    if (value === undefined || value.trim() === '' || value.startsWith('--')) return 'Give the host: --host <id-or-name>, from geckit computers.'
    computer = value
  }
  return { ...(computer === undefined || computer.toLowerCase() === 'local' ? {} : { computer }), args: rest }
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
  const known = knownComputers(folder)
  const exact = known.find((one) => one.id === computer)
  const matches = exact === undefined ? known.filter((one) => one.name.toLowerCase() === computer.toLowerCase()) : [exact]
  if (matches.length !== 1) return { ok: false, said: matches.length === 0 ? `No paired computer is called ${computer}. No command ran locally.` : `More than one computer is called ${computer}. Use its ID.` }
  computer = matches[0]?.id ?? computer
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
  return { ok: false, said: `${computer} did not answer. Delivery is uncertain; inspect target state before retrying.` }
}
