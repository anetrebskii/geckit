import { plainText } from './channel-text'
import type { SessionItem } from '../shared/api'
import { fill, PROMPTS } from '../prompts/prompts'

export interface ManagerCommand {
  readonly id: string
  readonly args: readonly string[]
}

function splitManagerOutput(text: string) {
  const visible: string[] = []
  const actions: string[] = []
  let note: string | undefined
  let fence: { marker: string; kind: 'geckit' | 'status' | 'markdown'; lines: string[] } | undefined

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    const marker = match?.[1]
    const label = match?.[2]?.trim()
    const control = marker?.startsWith('`') === true && (label === 'geckit' || label === 'status') ? label : undefined
    if (fence !== undefined && marker !== undefined && label === '' && marker[0] === fence.marker[0] && marker.length >= fence.marker.length) {
      if (fence.kind === 'geckit') actions.push(fence.lines.join('\n'))
      if (fence.kind === 'status') note = fence.lines.join(' ').replace(/\s+/g, ' ').trim()
      if (fence.kind === 'markdown') visible.push(line)
      fence = undefined
      continue
    }
    if (marker !== undefined && (fence === undefined || fence.kind === 'status' && control !== undefined)) {
      fence = { marker, kind: control ?? 'markdown', lines: [] }
      if (fence.kind === 'markdown') visible.push(line)
    } else if (fence === undefined || fence.kind === 'markdown') {
      visible.push(line)
    } else {
      fence.lines.push(line)
    }
  }
  return { visible: visible.join('\n'), actions, note: note || undefined }
}

export function managerOutput(text: string) {
  const { visible, actions } = splitManagerOutput(text)
  if (actions.length > 10) throw new Error('Manager requested too many operations in one turn.')
  const invalid = 'Manager returned an invalid GeckIt command. Retry the turn.'
  const commands = actions.map((action): ManagerCommand => {
    let parsed: Partial<ManagerCommand> | null
    try { parsed = JSON.parse(action) as typeof parsed } catch { throw new Error(invalid) }
    if (typeof parsed?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(parsed.id) || !Array.isArray(parsed.args) || parsed.args.length === 0 || parsed.args.length > 40 || !parsed.args.every((arg) => typeof arg === 'string' && arg.length <= 100_000)) throw new Error(invalid)
    return { id: parsed.id, args: parsed.args }
  })
  return { commands, visible: plainText(visible) }
}

export function managerMessage(text: string): string {
  return plainText(splitManagerOutput(text).visible)
}

/** The last status line Manager wrote for the people in a thread, from a finished fenced status block. */
export function managerNote(text: string): string | undefined {
  return splitManagerOutput(text).note
}

export function managerVisibleItem(item: SessionItem): SessionItem {
  if (item.kind !== 'theirs') return item
  return { ...item, text: managerMessage(item.text) }
}

const CONTEXT_BEGIN = '[GeckIt internal Manager context v1]\n'
const CONTEXT_END = '\n[/GeckIt internal Manager context v1]\n\n'
const MANAGER_ROLE = PROMPTS.manager.role

export function managerContext(prompt: string, text: string): string { return `${CONTEXT_BEGIN}${prompt}${CONTEXT_END}${text}` }

export function managerHistoryItem(item: SessionItem): SessionItem {
  if (item.kind !== 'mine' || !item.text.startsWith(`${CONTEXT_BEGIN}${MANAGER_ROLE}`)) return item
  const end = item.text.indexOf(CONTEXT_END)
  return end < 0 ? item : { ...item, text: item.text.slice(end + CONTEXT_END.length) }
}

export const MANAGER_INSTRUCTIONS = fill(PROMPTS.manager.instructions, { role: MANAGER_ROLE })
