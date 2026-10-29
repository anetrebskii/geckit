import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DEFAULT_SETTINGS } from '../../shared/api'
import type { CalendarRecurrence, Shortcut, ShortcutDraft } from '../../shared/api'
import type { Geckit } from '../../preload'
import { describeRecurrence } from '../../shared/recurrence'
import type { ShortcutChat } from './chat/ShortcutList'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
const phone = query.has('phone')
if (phone) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark'
const recurrence: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'day', end: { kind: 'after', count: 13 } }
const fixtureRecurrence: CalendarRecurrence = query.has('ended') ? { ...recurrence, start: '2026-09-01', interval: 1, unit: 'day', end: { kind: 'after', count: 3 } } : recurrence
const saved: Shortcut = { id: 'review', name: 'Morning review', root: '/work/geckit', prompt: 'Review the pull requests waiting for me.', mode: 'auto', provider: 'claude', on: !query.has('paused'), since: Date.now(), ...(query.has('cron') ? { cron: '0 */2 * * *' } : { recurrence: fixtureRecurrence }) }
let fail = query.has('fail')
let failOnce = query.has('failonce')
let notify: ((one: Shortcut) => void) | undefined
let saveCalls = 0
let countSaveCalls: ((count: number) => void) | undefined
const shortcuts: Geckit['shortcuts'] = {
  save: async (draft) => {
    countSaveCalls?.(++saveCalls)
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (fail || failOnce) { failOnce = false; throw new Error('Preview save failed') }
    const { recurrence: _recurrence, ...legacyDraft } = draft
    const one: Shortcut = { ...(query.has('legacy') || query.has('legacyresponse') ? legacyDraft : draft), id: draft.id ?? 'preview', since: saved.since }
    notify?.(one)
    return one
  },
  run: async () => 'preview-session',
  remove: () => undefined,
  onManage: () => () => undefined,
}
Object.assign(window, { geckit: { platform: 'darwin', shortcuts, chat: { models: async () => [{ value: 'sonnet', name: 'Sonnet', isDefault: true }] } } })
const { ShortcutList } = await import('./chat/ShortcutList')
const { PhoneShortcuts, ShortcutSheet } = await import('./chat/PhoneShortcuts')

function Preview(): React.JSX.Element {
  const [one, setOne] = useState(saved)
  const [editing, setEditing] = useState<string | ShortcutDraft | undefined>(query.has('list') ? undefined : one)
  const [failed, setFailed] = useState(fail)
  const [calls, setCalls] = useState(saveCalls)
  useEffect(() => { notify = setOne; return () => { notify = undefined } }, [])
  useEffect(() => { countSaveCalls = setCalls; return () => { countSaveCalls = undefined } }, [])
  const chat: ShortcutChat = { settings: { ...DEFAULT_SETTINGS, projects: ['/work/geckit'], calendarTimeZone: query.get('zone') ?? 'Europe/Samara', ...(query.has('legacy') ? {} : { calendarRecurrenceVersion: 1 }), shortcuts: [one] }, root: '/work/geckit', everyone: [], goTo: () => undefined }
  return <main className={`recurrence-preview${phone ? ' phone' : ''}`}>
    <header className="recurrence-preview-tools"><span>GeckIt</span><button type="button" onClick={() => setEditing(one)}>Edit shortcut</button><button type="button" onClick={() => setEditing(phone ? undefined : 'list')}>Shortcuts</button><label><input type="checkbox" checked={failed} onChange={(event) => { fail = event.target.checked; setFailed(fail) }} />Fail Save</label><span>{`Save calls: ${String(calls)}`}</span></header>
    {phone ? <PhoneShortcuts chat={chat} back="Settings" onBack={() => undefined} onEdit={setEditing} /> : <section className="recurrence-preview-context"><aside><h3>GeckIt</h3><p>To do</p><p>In progress</p><p>Done</p><p>Shortcuts</p></aside><article><h1>Morning review</h1><p>Saved prompt in geckit</p><div className="phone-group"><strong>{one.name}</strong><p>{one.prompt}</p><p>{one.recurrence === undefined ? one.cron ?? 'By hand' : describeRecurrence(one.recurrence)}</p></div></article></section>}
    {editing === undefined ? null : phone ? typeof editing === 'string' ? null : <ShortcutSheet chat={chat} given={editing} onClose={() => setEditing(undefined)} /> : <ShortcutList chat={chat} start={editing} onClose={() => setEditing(undefined)} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
