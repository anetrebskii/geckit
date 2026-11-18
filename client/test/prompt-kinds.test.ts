import { describe, expect, it } from 'vitest'

import type { Shortcut } from '../src/shared/api'
import { asDraft, catchUp, civilDay, dateField, duplicateDraft, kindError, kindOf, monthGrid, movedTo, needYou, needYouSaid, onceError, onceFrom, onDay, postponeChoices, problemLine, ranLine, runLaterDraft, scheduledLead, scheduledWhen, weekHeading, weekOf } from '../src/shared/prompt-kinds'

const at = (text: string): number => new Date(text).getTime()
const base: Shortcut = { id: 'p1', name: 'Plan', root: '/p', prompt: 'Plan the day', mode: 'auto', on: true, since: at('2026-11-18T08:00') }

describe('prompt kinds', () => {
  it('derives the kind from the timing', () => {
    expect(kindOf(base)).toBe('shortcut')
    expect(kindOf({ ...base, cron: '0 9 * * *' })).toBe('repeating')
    expect(kindOf({ ...base, recurrence: { start: '2026-11-18', time: '09:00', interval: 1, unit: 'day', weekdays: [], monthly: 'day', end: { kind: 'never' } } })).toBe('repeating')
    expect(kindOf({ ...base, at: at('2026-11-19T09:00') })).toBe('scheduled')
  })

  it('refuses a change of kind and a set time with a timetable', () => {
    expect(kindError(base, { ...base, at: 1 })).toBe('This prompt cannot change its kind.')
    expect(kindError({ ...base, cron: '0 9 * * *' }, base)).toBe('This prompt cannot change its kind.')
    expect(kindError(undefined, { at: 1, cron: '0 9 * * *' })).toBe('Choose one timetable.')
    expect(kindError({ ...base, at: 1 }, { at: 2 })).toBeUndefined()
  })

  it('takes a set time from one minute ahead', () => {
    const now = at('2026-11-18T10:00')
    expect(onceError(now, now)).toBe('Pick a time from now on.')
    expect(onceError(now + 60_000, now)).toBeUndefined()
  })
})

describe('Scheduled wording', () => {
  const now = at('2026-11-18T10:00')

  it('leads with the set day and time', () => {
    expect(scheduledLead(at('2026-11-18T15:30'), now)).toBe('Today 15:30')
    expect(scheduledLead(at('2026-11-19T10:00'), now)).toBe('Tomorrow 10:00')
    expect(scheduledLead(at('2026-11-20T10:00'), now)).toBe('Fri 20 Nov 10:00')
  })

  it('counts down in minutes, hours or days, and says Due once the time passed', () => {
    expect(scheduledWhen(at('2026-11-18T10:40'), now)).toBe('In 40 min')
    expect(scheduledWhen(at('2026-11-19T04:00'), now)).toBe('In 18 h')
    expect(scheduledWhen(at('2026-11-21T10:00'), now)).toBe('In 3 days')
    expect(scheduledWhen(at('2026-11-18T09:59'), now)).toBe('Due')
  })

  it('counts the runs that need Alex and says why each did not run', () => {
    const prompts: Shortcut[] = [{ ...base, at: 1, outcome: { state: 'missed' } }, { ...base, at: 1, outcome: { state: 'didnt-start', reason: "Claude isn't available" } }, { ...base, at: 1 }, { ...base, at: 1, outcome: { state: 'ran', started: 1 } }]
    expect(needYou(prompts)).toBe(2)
    expect(needYouSaid(2)).toBe('2 need you')
    expect(problemLine(prompts[0] ?? base)).toBe("Missed. GeckIt wasn't running.")
    expect(problemLine(prompts[1] ?? base)).toBe("Didn't start: Claude isn't available.")
    expect(ranLine({ state: 'ran', started: at('2026-11-18T09:12'), lateMinutes: 40 })).toBe('Ran 09:12, 40 min late')
  })
})

describe('Postpone', () => {
  it('offers this evening only before 17:00', () => {
    expect(postponeChoices(at('2026-11-18T16:59')).map((one) => one.label)).toEqual(['In 1 hour', 'This evening, 18:00', 'Tomorrow, 09:00', 'Monday, 09:00'])
    expect(postponeChoices(at('2026-11-18T17:00')).map((one) => one.label)).toEqual(['In 1 hour', 'Tomorrow, 09:00', 'Monday, 09:00'])
  })

  it('names next Monday on a Monday, and every choice is in the future at the right time', () => {
    const monday = at('2026-11-16T10:00')
    const choices = postponeChoices(monday)
    expect(choices.map((one) => one.label)).toContain('Next Monday, 09:00')
    expect(choices.find((one) => one.label === 'Next Monday, 09:00')?.at).toBe(at('2026-11-23T09:00'))
    expect(postponeChoices(at('2026-11-18T10:00')).find((one) => one.label === 'Monday, 09:00')?.at).toBe(at('2026-11-23T09:00'))
    expect(postponeChoices(at('2026-11-18T10:00')).find((one) => one.label === 'Tomorrow, 09:00')?.at).toBe(at('2026-11-19T09:00'))
    expect(choices.every((one) => one.at > monday)).toBe(true)
  })

  it('moves a run to another day at the same time of day', () => {
    expect(movedTo(at('2026-11-19T10:15'), civilDay(at('2026-11-21T12:00')))).toBe(at('2026-11-21T10:15'))
  })

  it('creates on a day at 09:00, or the next whole hour today', () => {
    expect(onDay(civilDay(at('2026-11-20T12:00')), at('2026-11-18T10:20'))).toBe(at('2026-11-20T09:00'))
    expect(onDay(civilDay(at('2026-11-18T12:00')), at('2026-11-18T10:20'))).toBe(at('2026-11-18T11:00'))
  })

  it('runs a late start within 12 hours of the latest start and calls it missed after', () => {
    const latest = at('2026-11-18T09:30')
    expect(catchUp(latest, latest + 30_000)).toEqual({ run: true })
    expect(catchUp(latest, latest + 40 * 60_000)).toEqual({ run: true, lateMinutes: 40 })
    expect(catchUp(latest, latest + (11 * 60 + 59) * 60_000).run).toBe(true)
    expect(catchUp(latest, latest + (12 * 60 + 1) * 60_000).run).toBe(false)
  })
})

describe('Duplicate', () => {
  const now = at('2026-11-18T10:00')

  it('keeps every setting but the history, as the same kind named "{name} copy"', () => {
    const repeating: Shortcut = { ...base, cron: '0 9 * * 1-5', vary: true, employeeId: 'e1', model: 'opus', lastRun: 5, lastSession: 's' }
    const copy = duplicateDraft(repeating, now)
    expect(copy).toMatchObject({ name: 'Plan copy', cron: '0 9 * * 1-5', vary: true, employeeId: 'e1', model: 'opus', root: '/p', prompt: 'Plan the day' })
    expect(copy).not.toHaveProperty('id')
    expect(copy).not.toHaveProperty('lastRun')
    expect(copy).not.toHaveProperty('lastSession')
    expect(kindOf(copy)).toBe('repeating')
  })

  it('drops the outcome and postponed-from, and moves a past time to the next day', () => {
    const missed: Shortcut = { ...base, at: at('2026-11-17T09:00'), postponedFrom: at('2026-11-16T09:00'), outcome: { state: 'missed' } }
    const copy = duplicateDraft(missed, now)
    expect(copy.at).toBe(at('2026-11-18T09:00') < now + 60_000 ? at('2026-11-19T09:00') : at('2026-11-18T09:00'))
    expect(copy).not.toHaveProperty('outcome')
    expect(copy).not.toHaveProperty('postponedFrom')
    expect(duplicateDraft({ ...base, at: at('2026-11-20T09:00') }, now).at).toBe(at('2026-11-20T09:00'))
  })

  it('makes a Scheduled copy of a Shortcut for Run later', () => {
    const later = runLaterDraft({ ...base, lastRun: 3 }, now)
    expect(kindOf(later)).toBe('scheduled')
    expect(later.at).toBe(at('2026-11-19T09:00'))
    expect(later.vary).toBe(true)
  })
})

describe('calendar days', () => {
  it('lays a week out from Monday and a month in whole weeks', () => {
    const week = weekOf(civilDay(at('2026-11-18T12:00')))
    expect(week.map((day) => day.getUTCDate())).toEqual([16, 17, 18, 19, 20, 21, 22])
    expect(weekHeading(week)).toBe('November 2026')
    expect(weekHeading(weekOf(civilDay(at('2026-12-01T12:00'))))).toBe('Nov – Dec 2026')
    const month = monthGrid(civilDay(at('2026-11-18T12:00')))
    expect(month.length % 7).toBe(0)
    expect(month[0]?.getUTCDate()).toBe(26)
    expect(month[0]?.getUTCDay()).toBe(1)
  })
})

describe('editor fields', () => {
  it('reads Date and Time into a moment and back, and refuses a blank one', () => {
    const moment = onceFrom('2026-11-19', '09:30')
    expect(moment).toBe(at('2026-11-19T09:30'))
    expect(dateField(moment)).toBe('2026-11-19')
    expect(onceFrom('', '09:30')).toBeNaN()
    expect(onceFrom('2026-11-19', '')).toBeNaN()
  })

  it('saves a prompt back without its history', () => {
    const draft = asDraft({ ...base, at: at('2026-11-19T09:00'), lastRun: 1, outcome: { state: 'missed' }, postponedFrom: at('2026-11-18T09:00') })
    expect(draft).toEqual({ id: 'p1', name: 'Plan', root: '/p', prompt: 'Plan the day', mode: 'auto', on: true, at: at('2026-11-19T09:00') })
  })
})
