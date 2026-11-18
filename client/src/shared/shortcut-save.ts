import type { Geckit } from '../preload'
import type { Settings, Shortcut, ShortcutDraft } from './api'
import { sameRecurrence } from './recurrence'

export async function saveShortcut(api: Pick<Geckit['shortcuts'], 'save'>, settings: Pick<Settings, 'calendarRecurrenceVersion' | 'cronStartWindowVersion' | 'promptKindsVersion' | 'managerShortcutsVersion' | 'shortcutDestinationsVersion'>, draft: ShortcutDraft): Promise<Shortcut> {
  if (draft.destination !== undefined && settings.shortcutDestinationsVersion !== 1) throw new Error('The host does not support shortcut destinations.')
  if (draft.target === 'manager' && settings.managerShortcutsVersion !== 1) throw new Error('The host does not support Manager shortcuts.')
  if (draft.recurrence !== undefined && settings.calendarRecurrenceVersion !== 1) throw new Error('The scheduler does not support custom recurrence.')
  if (draft.at !== undefined && settings.promptKindsVersion !== 1) throw new Error('The scheduler does not support Scheduled prompts. Update GeckIt on that computer.')
  // An older scheduler varies a start only after the set time, by the minutes of its window.
  const { vary, ...older } = draft
  const sent = settings.promptKindsVersion === 1 ? draft : vary === true && draft.cron !== undefined && settings.cronStartWindowVersion === 1 ? { ...older, startWindowMinutes: 30 } : older
  const saved = await api.save(sent)
  if (draft.target !== saved.target) throw new Error('The host did not save this shortcut target.')
  if (!sameRecurrence(draft.recurrence, saved.recurrence)) throw new Error('The scheduler did not save this recurrence.')
  if (settings.promptKindsVersion === 1 && (draft.at !== saved.at || (draft.vary === true) !== (saved.vary === true))) throw new Error('The scheduler did not save this time.')
  if (draft.destination?.channel !== saved.destination?.channel || draft.destination?.destination !== saved.destination?.destination || draft.destination?.label !== saved.destination?.label) throw new Error('The host did not save this shortcut destination.')
  return saved
}
