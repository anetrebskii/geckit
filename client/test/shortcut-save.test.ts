import { describe, expect, it, vi } from 'vitest'

import type { Geckit } from '../src/preload'
import type { CalendarRecurrence, Shortcut, ShortcutDraft } from '../src/shared/api'
import { saveShortcut } from '../src/shared/shortcut-save'

const recurrence: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'day', end: { kind: 'after', count: 13 } }
const draft: ShortcutDraft = { id: 'review', name: 'Review', root: '/fixture', prompt: 'Review', mode: 'auto', on: true, recurrence }

describe('shortcut save acknowledgment', () => {
  it('refuses custom changes before calling an older scheduler and preserves its existing cron', async () => {
    const { recurrence: _rule, ...manual } = draft
    const previous: Shortcut = { ...manual, id: 'review', since: 1, cron: '0 9 * * 1-5' }
    let persisted = previous
    const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => {
      const { recurrence: _recurrence, ...legacy } = next
      persisted = { ...legacy, id: 'review', since: 1 }
      return persisted
    })
    await expect(saveShortcut({ save }, {}, draft)).rejects.toThrow('does not support custom recurrence')
    expect(save).not.toHaveBeenCalled()
    expect(persisted).toEqual(previous)
  })

  it('rejects a resolved response that strips the requested rule despite advertising support', async () => {
    const { recurrence: _rule, ...legacy } = draft
    const save = vi.fn<Geckit['shortcuts']['save']>(async () => ({ ...legacy, id: 'review', since: 1 }))
    await expect(saveShortcut({ save }, { calendarRecurrenceVersion: 1 }, draft)).rejects.toThrow('did not save this recurrence')
    expect(save).toHaveBeenCalledExactlyOnceWith(draft)
  })

  it('rejects a resolved response that changes the requested recurrence time', async () => {
    const save = vi.fn<Geckit['shortcuts']['save']>(async () => ({ ...draft, id: 'review', since: 1, recurrence: { ...recurrence, time: '10:00' } }))
    await expect(saveShortcut({ save }, { calendarRecurrenceVersion: 1 }, draft)).rejects.toThrow('did not save this recurrence')
    expect(save).toHaveBeenCalledExactlyOnceWith(draft)
  })

  it('accepts current scheduler acknowledgment without depending on field or weekday order', async () => {
    const { end, weekdays: _days, ...fields } = recurrence
    const saved: Shortcut = { ...draft, id: 'review', since: 1, recurrence: { end, weekdays: [4, 2], ...fields } }
    const save = vi.fn<Geckit['shortcuts']['save']>(async () => saved)
    expect(await saveShortcut({ save }, { calendarRecurrenceVersion: 1 }, draft)).toEqual(saved)
  })

  it('keeps manual and cron saves compatible with an older scheduler', async () => {
    const { recurrence: _rule, ...manual } = draft
    const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => ({ ...next, id: 'review', since: 1 }))
    expect((await saveShortcut({ save }, {}, manual)).recurrence).toBeUndefined()
    expect((await saveShortcut({ save }, {}, { ...manual, cron: '0 9 * * 1-5' })).cron).toBe('0 9 * * 1-5')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('sends a varied start to an older host as its start window, and checks a current host kept the time', async () => {
    const { recurrence: _recurrence, ...manual } = draft
    const varied: ShortcutDraft = { ...manual, cron: '0 9 * * *', vary: true }
    const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => ({ ...next, id: 'review', since: 1 }))
    await saveShortcut({ save }, { cronStartWindowVersion: 1 }, varied)
    expect(save).toHaveBeenLastCalledWith({ ...manual, cron: '0 9 * * *', startWindowMinutes: 30 })
    expect((await saveShortcut({ save }, { promptKindsVersion: 1 }, varied)).vary).toBe(true)
    save.mockImplementationOnce(async (next) => { const { vary: _vary, ...stripped } = next; return { ...stripped, id: 'review', since: 1 } })
    await expect(saveShortcut({ save }, { promptKindsVersion: 1 }, varied)).rejects.toThrow('did not save this time')
  })

  it('refuses a Scheduled prompt before calling an older host', async () => {
    const { recurrence: _recurrence, ...manual } = draft
    const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => ({ ...next, id: 'review', since: 1 }))
    await expect(saveShortcut({ save }, { cronStartWindowVersion: 1 }, { ...manual, at: 5 })).rejects.toThrow('does not support Scheduled prompts')
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects old hosts or acknowledgments that drop a Manager target', async () => {
    const manager: ShortcutDraft = { name: 'Recordings', root: '/fixture', prompt: 'Check recordings', mode: 'auto', on: true, target: 'manager' }
    const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => ({ ...next, id: 'manager', since: 1 }))
    await expect(saveShortcut({ save }, {}, manager)).rejects.toThrow('does not support Manager shortcuts')
    expect(save).not.toHaveBeenCalled()
    expect((await saveShortcut({ save }, { managerShortcutsVersion: 1 }, manager)).target).toBe('manager')
    save.mockImplementationOnce(async (next) => { const { target: _target, ...legacy } = next; return { ...legacy, id: 'manager', since: 1 } })
    await expect(saveShortcut({ save }, { managerShortcutsVersion: 1 }, manager)).rejects.toThrow('did not save this shortcut target')
  })

})

it('checks destination host support and refuses silent field loss', async () => {
  const draft: ShortcutDraft = { name: 'Result', root: '/fixture', prompt: 'Inspect', mode: 'auto', on: false, destination: { channel: 'channel:discord', destination: '123', label: '#general' } }
  const save = vi.fn<Geckit['shortcuts']['save']>(async (next) => ({ ...next, id: 'result', since: 1 }))
  await expect(saveShortcut({ save }, {}, draft)).rejects.toThrow('does not support shortcut destinations')
  expect(save).not.toHaveBeenCalled()
  expect((await saveShortcut({ save }, { shortcutDestinationsVersion: 1 }, draft)).destination).toEqual(draft.destination)
  save.mockImplementationOnce(async (next) => { const { destination: _destination, ...legacy } = next; return { ...legacy, id: 'result', since: 1 } })
  await expect(saveShortcut({ save }, { shortcutDestinationsVersion: 1 }, draft)).rejects.toThrow('did not save this shortcut destination')
})
