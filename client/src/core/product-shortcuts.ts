import { isDeepStrictEqual } from 'node:util'
import type { Shortcut, ShortcutDraft } from '../shared/api'
import type { CoreMethods } from './application'
import { getSettings } from '../main/store'
import { requestedProvider } from '../cli/start'
import { isCron } from '../shared/schedule'
import { flagsFrom, jsonInput, onlyFields, required } from './product-input'

export const shortcutDraft = ({ since: _since, lastRun: _lastRun, lastSession: _lastSession, ...draft }: Shortcut): ShortcutDraft => draft
export async function productShortcuts(api: CoreMethods, args: readonly string[]): Promise<string> {
  const [command, ...rest] = args
  const json = <T>(value: T): string => JSON.stringify(value ?? null)
  if (command === 'list' && rest.length === 0) return json(getSettings().shortcuts.map(shortcutDraft))
  if (command === 'save') {
    const flags = flagsFrom(rest, ['--draft', '--expected'])
    const draft = jsonInput(required(flags, '--draft'))
    onlyFields(draft, ['id', 'name', 'root', 'prompt', 'mode', 'on', 'provider', 'reasoning', 'target', 'goal', 'model', 'employeeId', 'cron', 'recurrence', 'startWindowMinutes'])
    if (!['name', 'root', 'prompt', 'mode'].every((key) => typeof draft[key] === 'string') || typeof draft.on !== 'boolean' || !['manual', 'auto', 'plan'].includes(String(draft.mode)) || !getSettings().projects.includes(String(draft.root))) throw new Error('Supply name, registered root, prompt, mode and boolean on.')
    if (['id', 'provider', 'reasoning', 'goal', 'model', 'employeeId', 'cron'].some((key) => draft[key] !== undefined && typeof draft[key] !== 'string') || draft.target !== undefined && draft.target !== 'manager') throw new Error('Invalid shortcut fields.')
    if (draft.target !== 'manager') {
      const provider = requestedProvider(String(draft.provider ?? 'claude'))
      if (provider === undefined || !getSettings().chatProviders.includes(provider)) throw new Error('Select an enabled shortcut provider explicitly.')
    }
    if (draft.startWindowMinutes !== undefined && (typeof draft.startWindowMinutes !== 'number' || !Number.isSafeInteger(draft.startWindowMinutes))) throw new Error('Start window must be an integer.')
    if (typeof draft.cron === 'string' && draft.cron !== '' && !isCron(draft.cron)) throw new Error('Use a valid five-field cron line.')
    if (draft.reasoning !== undefined && !['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(String(draft.reasoning))) throw new Error('Invalid reasoning effort.')
    const current = getSettings().shortcuts.find((one) => one.id === draft.id)
    if (!isDeepStrictEqual(current === undefined ? null : shortcutDraft(current), JSON.parse(required(flags, '--expected')))) throw new Error('Shortcut changed. Read shortcuts list and merge before retrying.')
    return json(api['shortcuts:save'](draft as Partial<ShortcutDraft> as ShortcutDraft))
  }
  const id = required(flagsFrom(rest, ['--id']), '--id')
  if (!getSettings().shortcuts.some((one) => one.id === id)) throw new Error('Unknown shortcut ID.')
  if (command === 'remove') return json(api['shortcuts:remove'](id))
  if (command === 'run') {
    const session = await api['shortcuts:run'](id)
    if (session === undefined) throw new Error('Could not run this shortcut. Read its provider, employee and Manager readiness before retrying.')
    return json({ id: session })
  }
  throw new Error('Use shortcuts list|save|remove|run.')
}
