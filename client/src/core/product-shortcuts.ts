import { shortcutDestinationError } from '../shared/shortcut-destination-validation'
import { isDeepStrictEqual } from 'node:util'
import type { Shortcut, ShortcutDraft } from '../shared/api'
import type { CoreMethods } from './application'
import { getSettings } from '../main/store'
import { requestedProvider } from '../cli/start'
import { isCron } from '../shared/schedule'
import { kindOf } from '../shared/prompt-kinds'
import { checklistItems } from '../shared/checklists'
import { flagsFrom, jsonInput, onlyFields, required } from './product-input'

export const shortcutDraft = ({ since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, ...draft }: Shortcut): ShortcutDraft => draft
export async function productShortcuts(api: Pick<CoreMethods, 'shortcuts:save' | 'shortcuts:remove' | 'shortcuts:postpone' | 'shortcuts:run' | 'shortcuts:destinations' | 'shortcuts:runs'>, args: readonly string[]): Promise<string> {
  const [command, ...rest] = args
  const json = <T>(value: T): string => JSON.stringify(value ?? null)
  if (command === 'list' && rest.length === 0) return json(getSettings().shortcuts.map((one) => ({ ...shortcutDraft(one), kind: kindOf(one), ...(one.outcome === undefined ? {} : { outcome: one.outcome.state }), ...(one.postponedFrom === undefined ? {} : { postponedFrom: one.postponedFrom }) })))
  if (command === 'postpone') {
    const flags = flagsFrom(rest, ['--id', '--at'])
    const at = Date.parse(required(flags, '--at'))
    if (!Number.isFinite(at)) throw new Error('Use --at with an ISO date and time.')
    return json(api['shortcuts:postpone'](required(flags, '--id'), at))
  }
  if (command === 'destinations' && rest.length === 0) return json(await api['shortcuts:destinations']())
  if (command === 'runs') {
    const flags = flagsFrom(rest, ['--id'])
    return json(api['shortcuts:runs'](flags.get('--id')))
  }
  if (command === 'save') {
    const flags = flagsFrom(rest, ['--draft', '--expected'])
    const draft = jsonInput(required(flags, '--draft'))
    onlyFields(draft, ['id', 'name', 'root', 'prompt', 'mode', 'on', 'provider', 'reasoning', 'target', 'goal', 'checklist', 'model', 'employeeId', 'cron', 'recurrence', 'at', 'vary', 'startWindowMinutes', 'destination'])
    if (!['name', 'root', 'prompt', 'mode'].every((key) => typeof draft[key] === 'string') || typeof draft.on !== 'boolean' || !['manual', 'auto', 'plan'].includes(String(draft.mode)) || !getSettings().projects.includes(String(draft.root))) throw new Error('Supply name, registered root, prompt, mode and boolean on.')
    if (['id', 'provider', 'reasoning', 'goal', 'model', 'employeeId', 'cron'].some((key) => draft[key] !== undefined && typeof draft[key] !== 'string') || draft.target !== undefined && draft.target !== 'manager') throw new Error('Invalid shortcut fields.')
    if (draft.checklist !== undefined && !(typeof draft.checklist === 'object' && draft.checklist !== null && Array.isArray((draft.checklist as { items?: unknown }).items))) throw new Error('A checklist is an object with items.')
    if (draft.checklist !== undefined && (draft.checklist as { items: unknown[] }).items.length > 0) checklistItems((draft.checklist as { items: unknown }).items)
    if (draft.target !== 'manager') {
      const provider = requestedProvider(String(draft.provider ?? 'claude'))
      if (provider === undefined || !getSettings().chatProviders.includes(provider)) throw new Error('Select an enabled shortcut provider explicitly.')
    }
    if (draft.startWindowMinutes !== undefined && (typeof draft.startWindowMinutes !== 'number' || !Number.isSafeInteger(draft.startWindowMinutes))) throw new Error('Start window must be an integer.')
    if (typeof draft.cron === 'string' && draft.cron !== '' && !isCron(draft.cron)) throw new Error('Use a valid five-field cron line.')
    if (draft.at !== undefined && (typeof draft.at !== 'number' || !Number.isFinite(draft.at))) throw new Error('at is a moment in milliseconds.')
    if (draft.vary !== undefined && typeof draft.vary !== 'boolean') throw new Error('vary is true or false.')
    if (draft.reasoning !== undefined && !['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(String(draft.reasoning))) throw new Error('Invalid reasoning effort.')
    const destinationError = shortcutDestinationError(draft.destination)
    if (destinationError !== undefined) throw new Error(destinationError)
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
  throw new Error('Use shortcuts list|save|postpone|remove|run|destinations|runs.')
}
