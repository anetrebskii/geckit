import { telegramText } from './telegram-text'
import type { SessionItem } from '../shared/api'
import { fill, PROMPTS } from '../prompts/prompts'

export interface ManagerCommand {
  readonly id: string
  readonly args: readonly string[]
}

export function managerCommands(text: string): ManagerCommand[] {
  const commands: ManagerCommand[] = []
  for (const match of text.matchAll(/```geckit\s*\n([\s\S]*?)```/g)) {
    let parsed: { id?: string; args?: string[] }
    try { parsed = JSON.parse(match[1] ?? '') as typeof parsed } catch { throw new Error('Manager returned an invalid GeckIt command. Retry the turn.') }
    if (typeof parsed.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(parsed.id) || !Array.isArray(parsed.args) || parsed.args.length === 0 || parsed.args.length > 40 || !parsed.args.every((arg) => typeof arg === 'string' && arg.length <= 100_000)) {
      throw new Error('Manager returned an invalid GeckIt command. Retry the turn.')
    }
    commands.push({ id: parsed.id, args: parsed.args })
  }
  if (commands.length > 10) throw new Error('Manager requested too many operations in one turn.')
  return commands
}

export function managerMessage(text: string): string {
  return telegramText(text.replace(/```(?:geckit|status)[^\S\n]*\n[\s\S]*?(?:```|$)/g, ''))
}

/** The last status line Manager wrote for the people in a thread, from a finished fenced status block. */
export function managerNote(text: string): string | undefined {
  const said = [...text.matchAll(/```status[^\S\n]*\n([\s\S]*?)```/g)].at(-1)?.[1]?.replace(/\s+/g, ' ').trim()
  return said === undefined || said === '' ? undefined : said
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
