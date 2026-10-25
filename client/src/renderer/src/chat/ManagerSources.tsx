import { useState } from 'react'

import type { ManagerView } from '../../../shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../../../shared/manager-intake'
import type { ManagerIntakeConfig, ManagerWorkingWindow } from '../../../shared/manager-intake'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const ITEM_STATES = { 'waiting-sync': 'Waiting for recording to finish syncing', transcribing: 'Transcribing locally', classifying: 'Reviewing recording', 'awaiting-user': 'Waiting for your answer in Telegram', claiming: 'Handing to Manager', claimed: 'Handed to Manager', note: 'Note saved', ignored: 'Skipped', failed: 'Failed' } as const
const SOURCE_STATES = { disabled: 'Disabled', baseline: 'Baseline not established yet', ready: 'Ready', blocked: 'Access or setup needed' } as const
const INTAKE_STATES = { off: 'Automatic intake is off. Manual Manager work is unchanged.', 'outside-hours': 'Outside working hours', ready: 'Watching for new recordings', blocked: 'Automatic intake needs attention' } as const

export function ManagerSources({ view }: { readonly view: ManagerView }): React.JSX.Element {
  const current = view.config.intake ?? DEFAULT_MANAGER_INTAKE
  const [draft, setDraft] = useState<ManagerIntakeConfig>(current)
  const [base, setBase] = useState(JSON.stringify(current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const edit = (change: Partial<ManagerIntakeConfig>): void => { setDraft((before) => ({ ...before, ...change })); setSaved(false); setError('') }
  const windowAt = (index: number, change: Partial<ManagerWorkingWindow>): void => edit({ windows: draft.windows.map((one, at) => at === index ? { ...one, ...change } : one) })
  const save = async (): Promise<void> => {
    setError('')
    if (base !== JSON.stringify(current)) { setError('These settings changed in another window. Reload them before saving.'); return }
    try { new Intl.DateTimeFormat('en', { timeZone: draft.timeZone }).format() } catch { setError('Enter a valid IANA time zone, such as Europe/Samara.'); return }
    if (draft.windows.some((one) => one.days.length === 0 || one.start === '' || one.end === '' || one.start === one.end)) { setError('Choose at least one day and different start and end times for each interval.'); return }
    if (draft.enabled && (draft.windows.length === 0 || !draft.sources.some((one) => one.enabled))) { setError('Add working hours and enable a source before turning on automatic intake.'); return }
    if (draft.sources.some((one) => one.enabled && one.directory.trim() === '')) { setError('Enter the recordings directory for each enabled source.'); return }
    setSaving(true)
    try {
      const next = await window.geckit.manager.configure({ intake: draft })
      const config = next.config.intake ?? DEFAULT_MANAGER_INTAKE
      setDraft(config); setBase(JSON.stringify(config)); setSaved(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setSaving(false) }
  }
  return <form className="manager-sources" aria-labelledby="manager-sources-title" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <h4 id="manager-sources-title">Automatic task sources</h4>
    <p>Review new recordings in Telegram before anything starts.</p>
    <p>Manager and paired Telegram must be connected. GeckIt must stay open; checks run during working hours.</p>
    <label className="manager-sources-check"><input type="checkbox" checked={draft.enabled} disabled={saving} onChange={(event) => edit({ enabled: event.target.checked })} />Enable automatic intake</label>
    <p className="manager-sources-status" role="status">{INTAKE_STATES[view.intake?.state ?? 'off']}</p>
    {view.intake?.detail === undefined ? null : <p className="manager-error" role="status">{view.intake.detail}</p>}
    <fieldset disabled={saving}>
      <legend>Working hours</legend>
      <p>Working hours apply only to new task sources. Manual messages and queued work continue at any time.</p>
      <label className="manager-sources-field">Time zone<input value={draft.timeZone} placeholder="Europe/Samara" onChange={(event) => edit({ timeZone: event.target.value })} /></label>
      {draft.windows.map((one, index) => <fieldset className="manager-source-window" key={index}>
        <legend>Interval {index + 1}</legend>
        <div className="manager-source-days">{DAYS.map((day, at) => <label key={day}><input type="checkbox" aria-label={`${day}, interval ${index + 1}`} checked={one.days.includes(at)} onChange={(event) => windowAt(index, { days: event.target.checked ? [...one.days, at].sort() : one.days.filter((value) => value !== at) })} />{day}</label>)}</div>
        <div className="manager-source-times"><label>From<input type="time" aria-label={`Start, interval ${index + 1}`} value={one.start} onChange={(event) => windowAt(index, { start: event.target.value })} /></label><label>To<input type="time" aria-label={`End, interval ${index + 1}`} value={one.end} onChange={(event) => windowAt(index, { end: event.target.value })} /></label><button type="button" className="quiet" onClick={() => edit({ windows: draft.windows.filter((_, at) => at !== index) })}>Remove interval {index + 1}</button></div>
      </fieldset>)}
      <p>An end time before the start continues into the next day.</p>
      <button type="button" className="quiet" onClick={() => edit({ windows: [...draft.windows, { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }] })}>Add interval</button>
    </fieldset>
    <fieldset disabled={saving}>
      <legend>Sources</legend>
      {draft.sources.length === 0 ? <p>No task sources yet.</p> : null}
      {draft.sources.map((source, index) => {
        const status = view.intake?.sources.find((one) => one.id === source.id)
        return <div className="manager-source" key={source.id}>
          <div className="manager-setting"><strong>Voice Memos (macOS){draft.sources.length > 1 ? ` ${index + 1}` : ''}</strong><button type="button" className="quiet" aria-label={`Remove Voice Memos source ${index + 1}`} onClick={() => edit({ sources: draft.sources.filter((one) => one.id !== source.id) })}>Remove</button></div>
          <label className="manager-sources-check"><input type="checkbox" checked={source.enabled} onChange={(event) => edit({ sources: draft.sources.map((one) => one.id === source.id ? { ...one, enabled: event.target.checked } : one) })} />Enable Voice Memos source {index + 1}</label>
          <label className="manager-sources-field">Recordings directory<input value={source.directory} placeholder="Path to the synced Voice Memos Recordings directory" onChange={(event) => edit({ sources: draft.sources.map((one) => one.id === source.id ? { ...one, directory: event.target.value } : one) })} /></label>
          <p>Existing recordings are excluded. Only new recordings will be reviewed.</p>
          {status === undefined ? <p>Save these settings. Access and the baseline are checked during working hours after enabling intake.</p> : <p role="status">{SOURCE_STATES[status.state]}{status.detail === undefined ? '' : `: ${status.detail}`}{status.state === 'blocked' ? ' Correct the prerequisite, then Save to retry.' : ''}</p>}
        </div>
      })}
      <details className="manager-aside"><summary>Where to find recordings</summary><p>On macOS, check <code className="manager-source-path">~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings</code>. The location can vary. Voice Memos must sync through iCloud, and GeckIt needs permission to read the folder. Access is checked during working hours after enabling intake. Saving does not change permissions.</p></details>
      <button type="button" className="quiet" onClick={() => edit({ sources: [...draft.sources, { id: crypto.randomUUID(), kind: 'voice-memos', enabled: false, directory: '' }] })}>Add Voice Memos</button>
    </fieldset>
    <p>Recording transcripts are sent to your selected Manager assistant for classification. Audio transcription stays on this computer.</p>
    <div className="manager-actions"><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save task sources'}</button>{base === JSON.stringify(current) ? null : <button type="button" className="quiet" disabled={saving} onClick={() => { setDraft(current); setBase(JSON.stringify(current)); setError(''); setSaved(false) }}>Reload source settings</button>}{saved ? <span role="status">Settings saved. Readiness is shown above.</span> : null}</div>
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    {view.intake?.notesDirectory === undefined ? null : <p>Saved notes: <span className="manager-source-path">{view.intake.notesDirectory}</span></p>}
    {view.intake === undefined || view.intake.items.length === 0 ? null : <div className="manager-source-recent"><h4>Recent intake</h4><ul>{view.intake.items.slice(0, 20).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{ITEM_STATES[item.state]}</span>{item.summary === undefined ? null : <p>{item.summary}</p>}{item.error === undefined ? null : <p className="manager-error">{item.error}</p>}{item.notePath === undefined ? null : <p className="manager-source-path">{item.notePath}</p>}</li>)}</ul></div>}
  </form>
}
