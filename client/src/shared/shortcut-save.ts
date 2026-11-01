import type { Geckit } from '../preload'
import type { Settings, Shortcut, ShortcutDraft } from './api'
import { sameRecurrence } from './recurrence'

export async function saveShortcut(api: Pick<Geckit['shortcuts'], 'save'>, settings: Pick<Settings, 'calendarRecurrenceVersion' | 'cronStartWindowVersion'>, draft: ShortcutDraft): Promise<Shortcut> {
  if (draft.recurrence !== undefined && settings.calendarRecurrenceVersion !== 1) throw new Error('The scheduler does not support custom recurrence.')
  if (draft.startWindowMinutes !== undefined && settings.cronStartWindowVersion !== 1) throw new Error('The scheduler does not support random start windows.')
  const saved = await api.save(draft)
  if (!sameRecurrence(draft.recurrence, saved.recurrence)) throw new Error('The scheduler did not save this recurrence.')
  if (draft.startWindowMinutes !== saved.startWindowMinutes) throw new Error('The scheduler did not save this start window.')
  return saved
}
