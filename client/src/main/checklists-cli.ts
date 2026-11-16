import { basename } from 'node:path'

import type { Settings } from '../shared/api'
import type { Checklist } from '../shared/checklists'
import { checklistGoal, checklistItems, checklistsFor, findChecklist } from '../shared/checklists'

export const CHECKLIST_COMMANDS = [
  'checklists list [--project <root-or-name>]',
  'checklists show --id <id-or-name> [--project <root-or-name>]',
  'checklists add --name <name> --items <JSON array> [--project <root-or-name>] [--default]',
  'checklists edit --id <id-or-name> [--name <name>] [--items <JSON array>] [--project <root-or-name>|--shared] [--default|--no-default]',
  'checklists remove --id <id-or-name>',
] as const

const USAGE = `Use ${CHECKLIST_COMMANDS.join('; ')}. Items: ["title", {"title": "...", "description": "...", "check": "none|command|review|person", "command": "npm test", "final": true}].`
const SWITCHES = ['--default', '--no-default', '--shared', '--json']
const VALUES = ['--project', '--id', '--name', '--items']

function flagsOf(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let at = 0; at < args.length; at++) {
    const flag = args[at] ?? ''
    if (flags.has(flag)) throw new Error(`Repeated argument: ${flag}`)
    if (SWITCHES.includes(flag)) flags.set(flag, 'true')
    else if (VALUES.includes(flag) && args[at + 1] !== undefined) flags.set(flag, args[++at] ?? '')
    else throw new Error(`Unexpected argument ${flag}. ${USAGE}`)
  }
  return flags
}

function folder(settings: Settings, said: string): string {
  if (settings.projects.includes(said)) return said
  const named = settings.projects.filter((one) => basename(one).toLowerCase() === said.trim().toLowerCase())
  if (named.length === 1 && named[0] !== undefined) return named[0]
  if (named.length > 1) throw new Error(`More than one folder is called ${said}. Use its full path: ${named.join(', ')}`)
  throw new Error(`No folder ${said}. There are: ${settings.projects.join(', ')}`)
}

const shown = (one: Checklist): object => ({ ...one, goal: checklistGoal({ from: { id: one.id, name: one.name }, items: one.items }) })

/** One default per folder: saving a default clears the others there. */
function stored(all: readonly Checklist[], saved: Checklist): Checklist[] {
  const cleared = saved.isDefault === true ? all.map((one) => (one.id !== saved.id && one.root === saved.root && one.isDefault === true ? (({ isDefault: _d, ...rest }) => rest)(one) : one)) : [...all]
  return cleared.some((one) => one.id === saved.id) ? cleared.map((one) => (one.id === saved.id ? saved : one)) : [...cleared, saved]
}

export function checklistsCommand(args: readonly string[], read: () => Settings, save: (change: Partial<Settings>) => Settings): string {
  const [command, ...rest] = args
  const flags = flagsOf(rest)
  const settings = read()
  const all = settings.checklists ?? []
  const project = flags.get('--project')
  const root = project === undefined ? undefined : folder(settings, project)
  const find = (): Checklist => {
    const said = flags.get('--id')?.trim()
    if (!said) throw new Error(`Missing --id. ${USAGE}`)
    const found = findChecklist(all, root ?? '', said) ?? all.filter((one) => one.name.toLowerCase() === said.toLowerCase()).reduce<Checklist | 'many' | undefined>((one, other) => (one === undefined ? other : 'many'), undefined)
    if (found === 'many') throw new Error(`More than one checklist is called ${said}. Use its id from checklists list.`)
    if (found === undefined) throw new Error(`No checklist ${said}. Run checklists list.`)
    return found
  }
  const name = (): string | undefined => {
    const said = flags.get('--name')
    if (said !== undefined && said.trim() === '') throw new Error('Enter a name for the checklist.')
    return said?.trim()
  }
  if (flags.has('--default') && flags.has('--no-default')) throw new Error('Choose --default or --no-default.')
  if (flags.has('--shared') && project !== undefined) throw new Error('Choose --project or --shared.')

  if (command === 'list') {
    if ([...flags.keys()].some((one) => !['--project', '--json'].includes(one))) throw new Error(USAGE)
    if (root === undefined) return JSON.stringify(all.map(shown))
    const offered = checklistsFor(all, root)
    return JSON.stringify([...offered.folder, ...offered.shared].map(shown))
  }
  if (command === 'show') return JSON.stringify(shown(find()))
  if (command === 'add') {
    const named = name()
    const itemsSaid = flags.get('--items')
    if (named === undefined || itemsSaid === undefined) throw new Error(`A checklist needs --name and --items. ${USAGE}`)
    if (flags.has('--default') && root === undefined) throw new Error('Only a folder checklist can be the default: add --project.')
    if (flags.has('--id') || flags.has('--no-default')) throw new Error(USAGE)
    const made: Checklist = { id: crypto.randomUUID(), name: named, ...(root === undefined ? {} : { root }), ...(flags.has('--default') ? { isDefault: true } : {}), items: checklistItems(itemsSaid) }
    save({ checklists: stored(all, made) })
    return JSON.stringify(shown(made))
  }
  if (command === 'edit') {
    const was = find()
    if (![...flags.keys()].some((one) => one !== '--id' && one !== '--json')) throw new Error(`Nothing to change. ${USAGE}`)
    const named = name()
    const itemsSaid = flags.get('--items')
    const place = flags.has('--shared') ? undefined : root ?? was.root
    const isDefault = flags.has('--default') ? true : flags.has('--no-default') ? false : was.isDefault === true && place === was.root
    if (isDefault && place === undefined) throw new Error('Only a folder checklist can be the default: add --project.')
    const { root: _root, isDefault: _default, ...base } = was
    const changed: Checklist = { ...base, ...(named === undefined ? {} : { name: named }), ...(place === undefined ? {} : { root: place }), ...(isDefault ? { isDefault: true } : {}), ...(itemsSaid === undefined ? {} : { items: checklistItems(itemsSaid) }) }
    save({ checklists: stored(all, changed) })
    return JSON.stringify(shown(changed))
  }
  if (command === 'remove') {
    const was = find()
    if ([...flags.keys()].some((one) => !['--id', '--project', '--json'].includes(one))) throw new Error(USAGE)
    save({ checklists: all.filter((one) => one.id !== was.id) })
    return JSON.stringify({ removed: was.id, name: was.name, note: 'Tasks started from it keep their copy.' })
  }
  throw new Error(USAGE)
}
